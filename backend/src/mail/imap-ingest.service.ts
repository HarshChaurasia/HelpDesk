import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { parseEmail } from './email-parser';

const REF_RE = /\[(HD-\d{6})\]/i;

export interface InboundEmailData {
  messageId: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
  isAutoReply: boolean;
}

export interface ProcessResult {
  outcome: 'CREATED_TICKET' | 'APPENDED' | 'IGNORED' | 'DUPLICATE';
  ticketId?: string | null;
  createdMessageId?: string | null;
}

const LAST_POLL_KEY = 'imapLastPoll';

@Injectable()
export class ImapIngestService {
  readonly logger = new Logger('ImapIngest');
  private running = false;

  constructor(
    readonly prisma: PrismaService,
    readonly tickets: TicketsService,
  ) {}

  private getImapConfig() {
    return {
      enabled: process.env.IMAP_ENABLED === 'true',
      host: process.env.IMAP_HOST || '',
      port: parseInt(process.env.IMAP_PORT || '993', 10),
      secure: process.env.IMAP_SECURE !== 'false',
      user: process.env.IMAP_USER || '',
      pass: process.env.IMAP_PASS || '',
    };
  }

  private async getLastPollDate(): Promise<Date> {
    // Check process.env first (fast, set after each poll)
    if (process.env.IMAP_LAST_POLL) {
      const d = new Date(process.env.IMAP_LAST_POLL);
      if (!isNaN(d.getTime())) return d;
    }
    // Fall back to DB (survives restarts)
    try {
      const row = await this.prisma.setting.findUnique({ where: { key: LAST_POLL_KEY } });
      if (row) {
        const d = new Date(row.value);
        if (!isNaN(d.getTime())) {
          process.env.IMAP_LAST_POLL = row.value; // warm the cache
          return d;
        }
      }
    } catch { /* Setting table may not exist yet */ }
    // First ever poll — go back 30 days
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  private async saveLastPollDate(date: Date): Promise<void> {
    const value = date.toISOString();
    process.env.IMAP_LAST_POLL = value;
    try {
      await this.prisma.setting.upsert({
        where:  { key: LAST_POLL_KEY },
        update: { value },
        create: { key: LAST_POLL_KEY, value },
      });
    } catch { /* Setting table may not exist yet */ }
  }

  /**
   * Core routing logic, extracted for testability.
   * Does NOT mark the IMAP message seen — caller handles that.
   */
  async processEmailMessage(data: InboundEmailData): Promise<ProcessResult> {
    // 1. Dedup
    const dup = await this.prisma.processedEmail.findUnique({
      where: { messageId: data.messageId },
    });
    if (dup) return { outcome: 'DUPLICATE' };

    // 2. Drop auto-replies/bounces
    if (data.isAutoReply) {
      await this.prisma.processedEmail.create({
        data: { messageId: data.messageId, outcome: 'IGNORED' },
      });
      return { outcome: 'IGNORED' };
    }

    // 3. Drop missing from address
    if (!data.fromEmail) {
      await this.prisma.processedEmail.create({
        data: { messageId: data.messageId, outcome: 'IGNORED' },
      });
      return { outcome: 'IGNORED' };
    }

    // 4. Parse structured fields from body
    const parsed = parseEmail(data.subject, data.body);

    // 5. Route: append to existing ticket or create new
    const refMatch = data.subject.match(REF_RE);
    let result: ProcessResult;

    if (refMatch) {
      const res = await this.tickets.appendFromEmail(
        refMatch[1].toUpperCase(),
        data.fromEmail,
        parsed.description,
        data.messageId,
      );
      result = res
        ? { outcome: 'APPENDED', ticketId: res.ticketId, createdMessageId: res.messageId }
        : { outcome: 'IGNORED' };
    } else {
      const res = await this.tickets.createFromEmail(
        data.fromEmail,
        data.fromName,
        parsed.subject,
        parsed.description,
        data.messageId,
        parsed.category,
        parsed.priority,
      );
      result = {
        outcome: 'CREATED_TICKET',
        ticketId: res.ticketId,
        createdMessageId: res.messageId,
      };
    }

    await this.prisma.processedEmail.create({
      data: {
        messageId: data.messageId,
        ticketId: result.ticketId ?? null,
        createdMessageId: result.createdMessageId ?? null,
        outcome: result.outcome,
      },
    });

    return result;
  }

  private makeClient(cfg: ReturnType<typeof this.getImapConfig>) {
    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      logger: false,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    } as any);
    // Prevent unhandled 'error' event from crashing Node
    client.on('error', (err: Error) => {
      this.logger.warn(`IMAP client error: ${err.message}`);
    });
    return client;
  }

  async testConnection(): Promise<{ ok: boolean; messageCount?: number; message: string }> {
    const cfg = this.getImapConfig();
    if (!cfg.host || !cfg.user) {
      return { ok: false, message: 'IMAP host or user not configured' };
    }
    const client = this.makeClient(cfg);
    try {
      await client.connect();
      const status = await client.status('INBOX', { messages: true });
      await client.logout();
      return {
        ok: true,
        messageCount: status.messages,
        message: `Connected to ${cfg.host}:${cfg.port}. INBOX has ${status.messages} message(s).`,
      };
    } catch (err: any) {
      try { await client.logout(); } catch { /* ignore */ }
      return { ok: false, message: err?.message ?? String(err) };
    }
  }

  async poll(): Promise<{ processed: number; since: string }> {
    const cfg = this.getImapConfig();
    if (!cfg.enabled) return { processed: 0, since: '' };
    if (this.running) return { processed: 0, since: '' };
    this.running = true;
    let processed = 0;

    // Always search the last 24 hours — IMAP SINCE is date-only so this
    // effectively means "yesterday and today". The processedEmail dedup table
    // prevents re-processing anything already seen.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pollStartedAt = new Date();

    const client = this.makeClient(cfg);

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        // IMAP SINCE is date-only (truncates time), so we may get some messages
        // just before our window — the processedEmail dedup table handles those.
        const uids = (await client.search({ since }, { uid: true })) || [];
        this.logger.log(`IMAP search since ${since.toISOString()} → ${(uids as number[]).length} candidate(s)`);

        if ((uids as number[]).length > 0) {
          for await (const msg of client.fetch(uids as number[], { source: true }, { uid: true })) {
            const parsed = await simpleParser(msg.source as Buffer);
            const messageId = parsed.messageId ?? `imap-${msg.uid}`;
            const from = parsed.from?.value?.[0];
            const isAutoReply = !!(
              parsed.headers.get('auto-submitted') ||
              parsed.headers.get('x-autoreply')
            );

            const result = await this.processEmailMessage({
              messageId,
              fromEmail: from?.address?.toLowerCase() ?? '',
              fromName: from?.name || from?.address || 'Unknown',
              subject: parsed.subject ?? '(no subject)',
              body:
                parsed.text ||
                (typeof parsed.html === 'string' ? parsed.html : '') ||
                '',
              isAutoReply,
            });

            if (result.outcome !== 'DUPLICATE') processed++;
          }
        }
      } finally {
        lock.release();
      }

      // Only advance the cursor on success
      await this.saveLastPollDate(pollStartedAt);
    } catch (err) {
      this.logger.error(`IMAP poll failed: ${err}`);
    } finally {
      try { await client.logout(); } catch { /* ignore */ }
      this.running = false;
    }

    if (processed) this.logger.log(`Ingested ${processed} email(s) since ${since.toISOString()}`);
    return { processed, since: since.toISOString() };
  }
}
