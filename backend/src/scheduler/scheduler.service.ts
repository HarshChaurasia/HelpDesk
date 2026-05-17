import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImapIngestService } from '../mail/imap-ingest.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('Scheduler');

  constructor(
    private readonly prisma: PrismaService,
    private readonly imap: ImapIngestService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async pollMail() {
    await this.imap.poll();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async flagSlaBreaches() {
    const now = new Date();
    const res = await this.prisma.ticket.updateMany({
      where: {
        slaBreached: false,
        status: { notIn: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
        slaResolutionDueAt: { lt: now },
      },
      data: { slaBreached: true },
    });
    if (res.count) this.logger.warn(`Flagged ${res.count} SLA breach(es)`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async autoClose() {
    const days = parseInt(process.env.AUTO_CLOSE_DAYS ?? '5', 10);
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const stale = await this.prisma.ticket.findMany({
      where: {
        status: TicketStatus.RESOLVED,
        resolvedAt: { lt: cutoff },
      },
      select: { id: true },
    });
    for (const t of stale) {
      await this.prisma.ticket.update({
        where: { id: t.id },
        data: { status: TicketStatus.CLOSED, closedAt: new Date() },
      });
      await this.prisma.ticketEvent.create({
        data: {
          ticketId: t.id,
          type: 'CLOSED',
          fromValue: TicketStatus.RESOLVED,
          toValue: TicketStatus.CLOSED,
          metadata: { reason: 'auto-close' },
        },
      });
    }
    if (stale.length) this.logger.log(`Auto-closed ${stale.length} ticket(s)`);
  }
}
