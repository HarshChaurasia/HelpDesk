import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';

const REF_RE = /\[(HD-\d{6})\]/i;

@Injectable()
export class ImapIngestService {
  private readonly logger = new Logger('ImapIngest');
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
  ) {}

  async poll(): Promise<{ processed: number }> {
    if (process.env.IMAP_ENABLED !== 'true') return { processed: 0 };
    if (this.running) return { processed: 0 };
    this.running = true;
    let processed = 0;
    const client = new ImapFlow({
      host: process.env.IMAP_HOST!,
      port: parseInt(process.env.IMAP_PORT ?? '993', 10),
      secure: process.env.IMAP_SECURE !== 'false',
      auth: { user: process.env.IMAP_USER!, pass: process.env.IMAP_PASS! },
      logger: false,
    });
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        for await (const msg of client.fetch({ seen: false }, { source: true })) {
          const parsed = await simpleParser(msg.source as Buffer);
          const messageId = parsed.messageId ?? `imap-${msg.uid}`;
          const dup = await this.prisma.processedEmail.findUnique({
            where: { messageId },
          });
          if (dup) {
            await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
            continue;
          }
          // Ignore auto-replies / bounces.
          const auto =
            parsed.headers.get('auto-submitted') ||
            parsed.headers.get('x-autoreply');
          if (auto) {
            await this.prisma.processedEmail.create({
              data: { messageId, outcome: 'IGNORED' },
            });
            await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
            continue;
          }

          const from = parsed.from?.value?.[0];
          const fromEmail = from?.address?.toLowerCase();
          const fromName = from?.name || fromEmail || 'Unknown';
          const subject = parsed.subject ?? '(no subject)';
          const body =
            parsed.text ||
            (typeof parsed.html === 'string' ? parsed.html : '') ||
            '';
          if (!fromEmail) {
            await this.prisma.processedEmail.create({
              data: { messageId, outcome: 'IGNORED' },
            });
            await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
            continue;
          }

          const refMatch = subject.match(REF_RE);
          let outcome: string;
          let ticketId: string | null = null;
          let createdMessageId: string | null = null;

          if (refMatch) {
            const res = await this.tickets.appendFromEmail(
              refMatch[1].toUpperCase(),
              fromEmail,
              body,
              messageId,
            );
            outcome = res ? 'APPENDED' : 'IGNORED';
            ticketId = res?.ticketId ?? null;
            createdMessageId = res?.messageId ?? null;
          } else {
            const res = await this.tickets.createFromEmail(
              fromEmail,
              fromName,
              subject,
              body,
              messageId,
            );
            outcome = 'CREATED_TICKET';
            ticketId = res.ticketId;
            createdMessageId = res.messageId;
          }

          await this.prisma.processedEmail.create({
            data: { messageId, ticketId, createdMessageId, outcome },
          });
          await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
          processed++;
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      this.logger.error(`IMAP poll failed: ${err}`);
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
      this.running = false;
    }
    if (processed) this.logger.log(`Ingested ${processed} email(s)`);
    return { processed };
  }
}
