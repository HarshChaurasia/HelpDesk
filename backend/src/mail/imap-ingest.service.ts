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

@Injectable()
export class ImapIngestService {
  readonly logger = new Logger('ImapIngest');
  private running = false;

  constructor(
    readonly prisma: PrismaService,
    readonly tickets: TicketsService,
  ) {}

  private async getImapConfig() {
    const keys = ['imapEnabled', 'imapHost', 'imapPort', 'imapSecure', 'imapUser', 'imapPass'];
    const rows = await this.prisma.setting.findMany({ where: { key: { in: keys } } });
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      enabled: (s.imapEnabled ?? process.env.IMAP_ENABLED) === 'true',
      host: s.imapHost || process.env.IMAP_HOST || '',
      port: parseInt(s.imapPort || process.env.IMAP_PORT || '993', 10),
      secure: (s.imapSecure ?? process.env.IMAP_SECURE ?? 'true') !== 'false',
      user: s.imapUser || process.env.IMAP_USER || '',
      pass: s.imapPass || process.env.IMAP_PASS || '',
    };
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

  async testConnection(): Promise<{ ok: boolean; messageCount?: number; message: string }> {
    const cfg = await this.getImapConfig();
    if (!cfg.host || !cfg.user) {
      return { ok: false, message: 'IMAP host or user not configured' };
    }
    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      logger: false,
    });
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

  async poll(): Promise<{ processed: number }> {
    const cfg = await this.getImapConfig();
    if (!cfg.enabled) return { processed: 0 };
    if (this.running) return { processed: 0 };
    this.running = true;
    let processed = 0;

    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        for await (const msg of client.fetch({ seen: false }, { source: true })) {
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

          await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
          if (result.outcome !== 'DUPLICATE') processed++;
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      this.logger.error(`IMAP poll failed: ${err}`);
    } finally {
      try { await client.logout(); } catch { /* ignore */ }
      this.running = false;
    }

    if (processed) this.logger.log(`Ingested ${processed} email(s)`);
    return { processed };
  }
}
