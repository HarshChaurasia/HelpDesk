import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotifChannelPref } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { NotificationsGateway } from './notifications.gateway';
import { DomainEvent } from '../tickets/tickets.service';

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
      case 'CREATED':
        return `Ticket ${e.reference} created`;
      case 'ASSIGNED':
        return `Ticket ${e.reference} assigned`;
      case 'STATUS_CHANGED':
        return `Ticket ${e.reference} status changed`;
      case 'MESSAGE_ADDED':
        return `New activity on ${e.reference}`;
      default:
        return `Update on ${e.reference}`;
    }
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
      const a = await this.prisma.user.findUnique({
        where: { id: ticket.assignedToId },
      });
      if (a) recipients.set(a.id, a);
    }

    const title = this.titleFor(e);
    const body = `${e.subject}${e.detail ? ` — ${e.detail}` : ''}`;

    for (const [userId, user] of recipients) {
      if (userId === e.actorId) continue; // don't notify the actor
      if (!user || !user.isActive || user.notifPref === NotifChannelPref.OFF) {
        continue;
      }
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
          body,
          emailSentAt: wantsEmail ? new Date() : null,
        },
      });

      if (wantsInApp) {
        this.gateway.pushToUser(userId, 'notification:new', notif);
      }
      if (wantsEmail) {
        await this.mailer.send({
          to: user.email,
          subject: `[${ticket.reference}] ${title}`,
          text: `${body}\n\nReference: ${ticket.reference}`,
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
