import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotifChannelPref, TicketStatus, Priority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { NotificationsGateway } from './notifications.gateway';
import { DomainEvent } from '../tickets/tickets.service';

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: 'New', OPEN: 'Open', IN_PROGRESS: 'In Progress',
  PENDING_CUSTOMER: 'Pending Customer', RESOLVED: 'Resolved',
  CLOSED: 'Closed', REOPENED: 'Reopened',
};
const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent',
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly gateway: NotificationsGateway,
  ) {}

  private titleFor(e: DomainEvent): string {
    switch (e.type) {
      case 'CREATED':      return `Ticket ${e.reference} created`;
      case 'ASSIGNED':     return `Ticket ${e.reference} assigned`;
      case 'STATUS_CHANGED': return `Ticket ${e.reference} status changed`;
      case 'MESSAGE_ADDED':  return `New reply on ${e.reference}`;
      case 'REOPENED':     return `Ticket ${e.reference} reopened`;
      case 'CLOSED':       return `Ticket ${e.reference} closed`;
      default:             return `Update on ${e.reference}`;
    }
  }

  private buildEmail(
    recipientName: string,
    title: string,
    detail: string,
    ticket: { reference: string; subject: string; status: TicketStatus; priority: Priority },
  ): { text: string; html: string } {
    const statusLabel = STATUS_LABEL[ticket.status] ?? ticket.status;
    const priorityLabel = PRIORITY_LABEL[ticket.priority] ?? ticket.priority;

    const text = [
      `Hi ${recipientName},`,
      '',
      title,
      detail ? detail : '',
      '',
      '---',
      `Reference:  ${ticket.reference}`,
      `Subject:    ${ticket.subject}`,
      `Status:     ${statusLabel}`,
      `Priority:   ${priorityLabel}`,
      '',
      `Reply to this email to add a comment. Keep [${ticket.reference}] in the subject line.`,
    ].join('\n');

    const html = `
<p>Hi <strong>${recipientName}</strong>,</p>
<p>${title}${detail ? `<br><em>${detail}</em>` : ''}</p>
<table style="border-collapse:collapse;font-size:14px;margin:16px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#666">Reference</td><td><strong>${ticket.reference}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Subject</td><td>${ticket.subject}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Status</td><td>${statusLabel}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Priority</td><td>${priorityLabel}</td></tr>
</table>
<p style="font-size:13px;color:#555">
  Reply to this email to add a comment.<br>
  Keep <code>[${ticket.reference}]</code> in the subject line so your reply is attached to the correct ticket.
</p>`;

    return { text, html };
  }

  @OnEvent('ticket.event')
  async handle(e: DomainEvent) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: e.ticketId },
      include: { watchers: { include: { user: true } } },
    });
    if (!ticket) return;

    const recipients = new Map<string, (typeof ticket.watchers)[number]['user']>();
    for (const w of ticket.watchers) recipients.set(w.userId, w.user);
    if (ticket.assignedToId) {
      const a = await this.prisma.user.findUnique({ where: { id: ticket.assignedToId } });
      if (a) recipients.set(a.id, a);
    }

    const title = this.titleFor(e);
    const detail = e.detail ?? '';
    const notifBody = `${e.subject}${detail ? ` — ${detail}` : ''}`;

    for (const [userId, user] of recipients) {
      if (userId === e.actorId) continue;
      if (!user || !user.isActive || user.notifPref === NotifChannelPref.OFF) continue;

      const wantsInApp =
        user.notifPref === NotifChannelPref.IN_APP ||
        user.notifPref === NotifChannelPref.BOTH;
      const wantsEmail =
        user.notifPref === NotifChannelPref.EMAIL ||
        user.notifPref === NotifChannelPref.BOTH;

      const notif = await this.prisma.notification.create({
        data: {
          userId,
          ticketId: ticket.id,
          eventType: e.type,
          title,
          body: notifBody,
          emailSentAt: wantsEmail ? new Date() : null,
        },
      });

      if (wantsInApp) {
        this.gateway.pushToUser(userId, 'notification:new', notif);
      }

      if (wantsEmail) {
        const { text, html } = this.buildEmail(
          user.fullName,
          title,
          detail,
          { reference: ticket.reference, subject: ticket.subject, status: ticket.status, priority: ticket.priority },
        );
        // Subject format: Re: [HD-XXXXXX] Original subject
        // The [HD-XXXXXX] tag is what IMAP ingest uses to thread customer replies back.
        await this.mailer.send({
          to: user.email,
          subject: `Re: [${ticket.reference}] ${ticket.subject}`,
          text,
          html,
        });
      }
    }
  }

  list(userId: string, q: any) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10));
    const limit = Math.min(100, parseInt(q.limit ?? '20', 10));
    return this.prisma.notification.findMany({
      where: {
        userId,
        isRead: q.isRead === undefined ? undefined : q.isRead === 'true',
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    return { ok: true };
  }

  async markAll(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { ok: true };
  }
}
