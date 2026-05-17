import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Priority,
  TicketStatus,
  MessageType,
  Channel,
  EventType,
  Role,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';
import { canTransition, allowedNext } from './state-machine';
import {
  CreateTicketDto,
  UpdateTicketDto,
  MessageDto,
} from './dto';

const DEFAULT_RESPONSE_MINS: Record<string, number> = {
  LOW: 480,
  MEDIUM: 240,
  HIGH: 120,
  URGENT: 30,
};
const DEFAULT_RESOLUTION_MINS: Record<string, number> = {
  LOW: 4320,
  MEDIUM: 2880,
  HIGH: 1440,
  URGENT: 480,
};

export interface DomainEvent {
  type: EventType;
  ticketId: string;
  reference: string;
  subject: string;
  actorId?: string | null;
  detail?: string;
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventEmitter2,
  ) {}

  private async nextReference(): Promise<string> {
    const c = await this.prisma.counter.upsert({
      where: { name: 'ticket' },
      update: { value: { increment: 1 } },
      create: { name: 'ticket', value: 1 },
    });
    return `HD-${String(c.value).padStart(6, '0')}`;
  }

  private async computeSla(priority: Priority, categoryId?: string | null) {
    let resp = DEFAULT_RESPONSE_MINS;
    let reso = DEFAULT_RESOLUTION_MINS;
    if (categoryId) {
      const cat = await this.prisma.category.findUnique({
        where: { id: categoryId },
        include: { slaPolicy: true },
      });
      if (cat?.slaPolicy) {
        resp = cat.slaPolicy.responseMins as any;
        reso = cat.slaPolicy.resolutionMins as any;
      }
    }
    const now = Date.now();
    return {
      slaResponseDueAt: new Date(now + (resp[priority] ?? 240) * 60000),
      slaResolutionDueAt: new Date(now + (reso[priority] ?? 2880) * 60000),
    };
  }

  private async writeEvent(
    ticketId: string,
    type: EventType,
    actorId: string | null,
    fromValue?: string,
    toValue?: string,
  ) {
    await this.prisma.ticketEvent.create({
      data: { ticketId, type, actorId, fromValue, toValue },
    });
  }

  private async addWatcherSilent(ticketId: string, userId: string) {
    await this.prisma.ticketWatcher.upsert({
      where: { ticketId_userId: { ticketId, userId } },
      update: {},
      create: { ticketId, userId },
    });
  }

  private emit(e: DomainEvent) {
    this.eventBus.emit('ticket.event', e);
  }

  // ---------- creation ----------

  async create(dto: CreateTicketDto, user: AuthUser) {
    const priority = dto.priority ?? Priority.MEDIUM;
    const sla = await this.computeSla(priority, dto.categoryId);
    const reference = await this.nextReference();
    const ticket = await this.prisma.ticket.create({
      data: {
        reference,
        subject: dto.subject,
        priority,
        channel: Channel.WEB,
        categoryId: dto.categoryId ?? null,
        createdById: user.id,
        ...sla,
        messages: {
          create: {
            authorId: user.id,
            body: dto.description,
            type: MessageType.PUBLIC_REPLY,
            channel: Channel.WEB,
          },
        },
        watchers: { create: { userId: user.id } },
      },
    });
    await this.writeEvent(ticket.id, EventType.CREATED, user.id);
    this.emit({
      type: EventType.CREATED,
      ticketId: ticket.id,
      reference,
      subject: ticket.subject,
      actorId: user.id,
    });
    return ticket;
  }

  private async resolveCustomerByEmail(email: string, name: string) {
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          fullName: name,
          role: Role.CUSTOMER,
          // random unusable password until they reset.
          passwordHash: await argon2.hash(randomBytes(24).toString('hex')),
        },
      });
    }
    return user;
  }

  async createFromEmail(
    fromEmail: string,
    fromName: string,
    subject: string,
    body: string,
    sourceMessageId: string,
  ) {
    const customer = await this.resolveCustomerByEmail(fromEmail, fromName);
    const sla = await this.computeSla(Priority.MEDIUM, null);
    const reference = await this.nextReference();
    const ticket = await this.prisma.ticket.create({
      data: {
        reference,
        subject,
        priority: Priority.MEDIUM,
        channel: Channel.EMAIL,
        createdById: customer.id,
        ...sla,
        messages: {
          create: {
            authorId: customer.id,
            body,
            type: MessageType.PUBLIC_REPLY,
            channel: Channel.EMAIL,
            sourceMessageId,
          },
        },
        watchers: { create: { userId: customer.id } },
      },
      include: { messages: true },
    });
    await this.writeEvent(ticket.id, EventType.CREATED, customer.id);
    this.emit({
      type: EventType.CREATED,
      ticketId: ticket.id,
      reference,
      subject,
      actorId: customer.id,
    });
    return { ticketId: ticket.id, messageId: ticket.messages[0].id };
  }

  async appendFromEmail(
    reference: string,
    fromEmail: string,
    body: string,
    sourceMessageId: string,
  ): Promise<{ ticketId: string; messageId: string } | null> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { reference },
    });
    if (!ticket) return null;
    const sender = await this.prisma.user.findUnique({
      where: { email: fromEmail },
    });
    const msg = await this.prisma.message.create({
      data: {
        ticketId: ticket.id,
        authorId: sender?.id ?? null,
        body,
        type: MessageType.PUBLIC_REPLY,
        channel: Channel.EMAIL,
        sourceMessageId,
      },
    });
    const isCustomerReply = sender?.id === ticket.createdById;
    const data: any = { lastCustomerActivityAt: new Date() };
    if (isCustomerReply && ticket.status === TicketStatus.RESOLVED) {
      data.status = TicketStatus.REOPENED;
      data.resolvedAt = null;
    }
    await this.prisma.ticket.update({ where: { id: ticket.id }, data });
    if (data.status === TicketStatus.REOPENED) {
      await this.writeEvent(
        ticket.id,
        EventType.REOPENED,
        sender?.id ?? null,
        TicketStatus.RESOLVED,
        TicketStatus.REOPENED,
      );
    }
    await this.writeEvent(
      ticket.id,
      EventType.MESSAGE_ADDED,
      sender?.id ?? null,
    );
    this.emit({
      type: EventType.MESSAGE_ADDED,
      ticketId: ticket.id,
      reference: ticket.reference,
      subject: ticket.subject,
      actorId: sender?.id ?? null,
      detail: 'New reply via email',
    });
    return { ticketId: ticket.id, messageId: msg.id };
  }

  // ---------- access ----------

  private async assertAccess(ticketId: string, user: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { watchers: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (user.role === Role.CUSTOMER) {
      const watching = ticket.watchers.some((w) => w.userId === user.id);
      if (ticket.createdById !== user.id && !watching) {
        throw new ForbiddenException('Not your ticket');
      }
    }
    return ticket;
  }

  // ---------- queries ----------

  async list(user: AuthUser, q: any) {
    const where: any = {};
    if (user.role === Role.CUSTOMER) {
      where.OR = [
        { createdById: user.id },
        { watchers: { some: { userId: user.id } } },
      ];
    } else {
      if (q.mine === 'true') where.assignedToId = user.id;
      if (q.unassigned === 'true') where.assignedToId = null;
      if (q.assignedToId) where.assignedToId = q.assignedToId;
    }
    if (q.status) where.status = q.status;
    if (q.priority) where.priority = q.priority;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.q) {
      where.AND = [
        {
          OR: [
            { subject: { contains: q.q, mode: 'insensitive' } },
            { reference: { contains: q.q, mode: 'insensitive' } },
          ],
        },
      ];
    }
    const page = Math.max(1, parseInt(q.page ?? '1', 10));
    const limit = Math.min(100, parseInt(q.limit ?? '20', 10));
    const [data, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        include: {
          category: true,
          assignedTo: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async getOne(id: string, user: AuthUser) {
    await this.assertAccess(id, user);
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        category: true,
        assignedTo: { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
        watchers: { include: { user: { select: { id: true, fullName: true } } } },
        attachments: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, fullName: true, role: true } } },
        },
        events: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundException();
    if (user.role === Role.CUSTOMER) {
      ticket.messages = ticket.messages.filter(
        (m) => m.type === MessageType.PUBLIC_REPLY,
      );
    }
    return { ...ticket, allowedTransitions: allowedNext(ticket.status) };
  }

  // ---------- mutations ----------

  async update(id: string, dto: UpdateTicketDto, user: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException();
    if (dto.priority && dto.priority !== ticket.priority) {
      await this.writeEvent(
        id,
        EventType.PRIORITY_CHANGED,
        user.id,
        ticket.priority,
        dto.priority,
      );
    }
    return this.prisma.ticket.update({ where: { id }, data: dto });
  }

  async changeStatus(id: string, to: TicketStatus, user: AuthUser) {
    const ticket = await this.assertAccess(id, user);
    if (
      user.role === Role.CUSTOMER &&
      !(ticket.status === TicketStatus.RESOLVED && to === TicketStatus.REOPENED)
    ) {
      throw new ForbiddenException(
        'Customers may only reopen a resolved ticket',
      );
    }
    if (!canTransition(ticket.status, to)) {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: `Cannot move from ${ticket.status} to ${to}`,
      });
    }
    const data: any = { status: to };
    if (to === TicketStatus.RESOLVED) data.resolvedAt = new Date();
    if (to === TicketStatus.CLOSED) data.closedAt = new Date();
    if (to === TicketStatus.REOPENED) data.resolvedAt = null;
    await this.prisma.ticket.update({ where: { id }, data });
    await this.writeEvent(
      id,
      to === TicketStatus.REOPENED ? EventType.REOPENED : EventType.STATUS_CHANGED,
      user.id,
      ticket.status,
      to,
    );
    this.emit({
      type: EventType.STATUS_CHANGED,
      ticketId: id,
      reference: ticket.reference,
      subject: ticket.subject,
      actorId: user.id,
      detail: `${ticket.status} → ${to}`,
    });
    return { ok: true, status: to };
  }

  async assign(id: string, assignedToId: string, user: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException();
    const agent = await this.prisma.user.findUnique({
      where: { id: assignedToId },
    });
    if (!agent || !([Role.AGENT, Role.ADMIN] as Role[]).includes(agent.role)) {
      throw new BadRequestException('Assignee must be an agent or admin');
    }
    const data: any = { assignedToId };
    if (ticket.status === TicketStatus.NEW) data.status = TicketStatus.OPEN;
    await this.prisma.ticket.update({ where: { id }, data });
    await this.addWatcherSilent(id, assignedToId);
    await this.writeEvent(
      id,
      EventType.ASSIGNED,
      user.id,
      ticket.assignedToId ?? undefined,
      assignedToId,
    );
    this.emit({
      type: EventType.ASSIGNED,
      ticketId: id,
      reference: ticket.reference,
      subject: ticket.subject,
      actorId: user.id,
      detail: `Assigned to ${agent.fullName}`,
    });
    return { ok: true };
  }

  async addMessage(id: string, dto: MessageDto, user: AuthUser) {
    const ticket = await this.assertAccess(id, user);
    let type = dto.type ?? MessageType.PUBLIC_REPLY;
    if (user.role === Role.CUSTOMER) type = MessageType.PUBLIC_REPLY;
    const msg = await this.prisma.message.create({
      data: {
        ticketId: id,
        authorId: user.id,
        body: dto.body,
        type,
        channel: Channel.WEB,
      },
    });
    const data: any = {};
    if (user.role === Role.CUSTOMER) {
      data.lastCustomerActivityAt = new Date();
      if (ticket.status === TicketStatus.RESOLVED) {
        data.status = TicketStatus.REOPENED;
        data.resolvedAt = null;
      }
    } else if (
      type === MessageType.PUBLIC_REPLY &&
      !ticket.firstResponseAt
    ) {
      data.firstResponseAt = new Date();
    }
    if (Object.keys(data).length) {
      await this.prisma.ticket.update({ where: { id }, data });
    }
    await this.writeEvent(id, EventType.MESSAGE_ADDED, user.id);
    if (type === MessageType.PUBLIC_REPLY) {
      this.emit({
        type: EventType.MESSAGE_ADDED,
        ticketId: id,
        reference: ticket.reference,
        subject: ticket.subject,
        actorId: user.id,
        detail: 'New reply',
      });
    }
    return msg;
  }

  async events(id: string, user: AuthUser) {
    await this.assertAccess(id, user);
    return this.prisma.ticketEvent.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, fullName: true } } },
    });
  }

  async addWatcher(id: string, userId: string, actor: AuthUser) {
    await this.addWatcherSilent(id, userId);
    await this.writeEvent(id, EventType.WATCHER_ADDED, actor.id, undefined, userId);
    return { ok: true };
  }

  async removeWatcher(id: string, userId: string, actor: AuthUser) {
    await this.prisma.ticketWatcher
      .delete({ where: { ticketId_userId: { ticketId: id, userId } } })
      .catch(() => null);
    await this.writeEvent(
      id,
      EventType.WATCHER_REMOVED,
      actor.id,
      userId,
      undefined,
    );
    return { ok: true };
  }

  async uploadAttachment(
    ticketId: string,
    file: Express.Multer.File,
    user: AuthUser,
  ) {
    await this.assertAccess(ticketId, user);
    return this.prisma.attachment.create({
      data: {
        ticketId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: file.filename,
        uploadedById: user.id,
      },
    });
  }

  async getAttachment(attachmentId: string, user: AuthUser) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    if (attachment.ticketId) {
      await this.assertAccess(attachment.ticketId, user);
    }
    return attachment;
  }
}
