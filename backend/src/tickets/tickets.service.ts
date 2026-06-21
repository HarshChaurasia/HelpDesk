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
  TimeLogType,
  Role,
} from '@prisma/client';
import * as argon2 from 'argon2';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { randomBytes } from 'crypto';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';
import { canTransition, allowedNext } from './state-machine';
import {
  CreateTicketDto,
  UpdateTicketDto,
  MessageDto,
  TimeLogDto,
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
        subcategoryId: dto.subcategoryId ?? null,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
        estimatedEffortHours: dto.estimatedEffortHours ?? null,
        systemProduct: dto.systemProduct ?? null,
        systemModule: dto.systemModule ?? null,
        systemVersion: dto.systemVersion ?? null,
        systemBrowser: dto.systemBrowser ?? null,
        systemOs: dto.systemOs ?? null,
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
        ...(dto.assigneeIds?.length
          ? {
              assignedToId: dto.assigneeIds[0],
              assignees: { create: dto.assigneeIds.map((id) => ({ userId: id })) },
            }
          : {}),
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
    categoryName?: string,
    parsedPriority?: string,
  ) {
    const customer = await this.resolveCustomerByEmail(fromEmail, fromName);
    const priority: Priority = (parsedPriority as Priority) ?? Priority.MEDIUM;

    // Resolve category by name if provided
    let categoryId: string | null = null;
    if (categoryName) {
      const cat = await this.prisma.category.findFirst({
        where: { name: { equals: categoryName, mode: 'insensitive' }, isActive: true },
      });
      categoryId = cat?.id ?? null;
    }

    const sla = await this.computeSla(priority, categoryId);
    const reference = await this.nextReference();
    const ticket = await this.prisma.ticket.create({
      data: {
        reference,
        subject,
        priority,
        channel: Channel.EMAIL,
        categoryId,
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

    // Secondary dedup: if this sourceMessageId was already stored, return idempotently
    const existing = await this.prisma.message.findFirst({
      where: { ticketId: ticket.id, sourceMessageId },
    });
    if (existing) return { ticketId: ticket.id, messageId: existing.id };

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
    if (q.status) {
      where.status = Array.isArray(q.status)
        ? { in: q.status }
        : q.status;
    }
    if (q.priority) {
      where.priority = Array.isArray(q.priority)
        ? { in: q.priority }
        : q.priority;
    }
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.subcategoryId) where.subcategoryId = q.subcategoryId;
    if (q.tagId) where.tags = { some: { tagId: q.tagId } };
    if (q.createdAfter) where.createdAt = { ...where.createdAt, gte: new Date(q.createdAfter) };
    if (q.createdBefore) where.createdAt = { ...where.createdAt, lte: new Date(q.createdBefore) };
    if (q.slaBreached === 'true') where.slaBreached = true;
    if (q.q) {
      where.AND = [
        {
          OR: [
            { subject: { contains: q.q, mode: 'insensitive' } },
            { reference: { contains: q.q, mode: 'insensitive' } },
            { createdBy: { fullName: { contains: q.q, mode: 'insensitive' } } },
          ],
        },
      ];
    }
    const page = Math.max(1, parseInt(q.page ?? '1', 10));
    const limit = Math.min(100, parseInt(q.limit ?? '25', 10));
    const sortField = q.sort ?? 'createdAt';
    const sortDir = q.dir === 'asc' ? 'asc' : 'desc';
    const allowedSorts: Record<string, any> = {
      createdAt: { createdAt: sortDir },
      updatedAt: { updatedAt: sortDir },
      priority: { priority: sortDir },
      status: { status: sortDir },
      reference: { reference: sortDir },
      subject: { subject: sortDir },
      category: { category: { name: sortDir } },
    };
    const orderBy = allowedSorts[sortField] ?? { createdAt: 'desc' };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          subcategory: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true, email: true } },
          tags: { include: { tag: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async upsertChangeRequest(ticketId: string, dto: any, user: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.prisma.changeRequest.upsert({
      where: { ticketId },
      update: {
        title: dto.title,
        description: dto.description ?? null,
        impact: dto.impact ?? null,
        rollbackPlan: dto.rollbackPlan ?? null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: dto.status ?? undefined,
      },
      create: {
        ticketId,
        title: dto.title,
        description: dto.description ?? null,
        impact: dto.impact ?? null,
        rollbackPlan: dto.rollbackPlan ?? null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        createdById: user.id,
      },
    });
  }

  async escalate(ticketId: string, level: number, reason: string, user: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.prisma.escalation.upsert({
      where: { ticketId },
      update: { level, reason, resolvedAt: null, escalatedById: user.id, updatedAt: new Date() },
      create: { ticketId, level, reason, escalatedById: user.id },
    });
  }

  async deEscalate(ticketId: string, user: AuthUser) {
    const esc = await this.prisma.escalation.findUnique({ where: { ticketId } });
    if (!esc) throw new NotFoundException('No active escalation found');
    return this.prisma.escalation.update({
      where: { ticketId },
      data: { resolvedAt: new Date() },
    });
  }

  async mergeTickets(sourceId: string, targetId: string, user: AuthUser) {
    if (sourceId === targetId) throw new BadRequestException('Cannot merge a ticket into itself');
    const [source, target] = await Promise.all([
      this.prisma.ticket.findUnique({ where: { id: sourceId }, include: { messages: true } }),
      this.prisma.ticket.findUnique({ where: { id: targetId } }),
    ]);
    if (!source) throw new NotFoundException('Source ticket not found');
    if (!target) throw new NotFoundException('Target ticket not found');
    if (source.status === TicketStatus.CLOSED) throw new BadRequestException('Source ticket is already closed');

    await this.prisma.$transaction(async (tx) => {
      // Copy non-deleted messages to target
      for (const msg of source.messages.filter((m) => !m.deletedAt)) {
        await tx.message.create({
          data: {
            ticketId: targetId,
            authorId: msg.authorId,
            type: msg.type,
            body: msg.body,
            channel: msg.channel,
            createdAt: msg.createdAt,
          },
        });
      }
      // Add a merge note to target
      await tx.message.create({
        data: {
          ticketId: targetId,
          authorId: user.id,
          type: MessageType.INTERNAL_NOTE,
          body: `Merged from ticket <strong>${source.reference}</strong> by ${user.email}.`,
          channel: Channel.WEB,
        },
      });
      // Close source
      await tx.ticket.update({
        where: { id: sourceId },
        data: { status: TicketStatus.CLOSED, closedAt: new Date() },
      });
      await tx.ticketEvent.create({
        data: { ticketId: sourceId, type: EventType.CLOSED, actorId: user.id, toValue: `Merged into ${target.reference}` },
      });
    });

    return { targetId, targetReference: target.reference };
  }

  async addRelated(ticketId: string, relatedId: string, user: AuthUser) {
    await this.assertAccess(ticketId, user);
    if (ticketId === relatedId) throw new BadRequestException('Cannot link a ticket to itself');
    const [a, b] = await this.prisma.$transaction([
      this.prisma.ticket.findUnique({ where: { id: ticketId } }),
      this.prisma.ticket.findUnique({ where: { id: relatedId } }),
    ]);
    if (!a || !b) throw new NotFoundException('Ticket not found');
    await this.prisma.$transaction([
      this.prisma.ticketRelation.upsert({
        where: { ticketId_relatedId: { ticketId, relatedId } },
        update: {},
        create: { ticketId, relatedId },
      }),
      this.prisma.ticketRelation.upsert({
        where: { ticketId_relatedId: { ticketId: relatedId, relatedId: ticketId } },
        update: {},
        create: { ticketId: relatedId, relatedId: ticketId },
      }),
    ]);
    return { ok: true };
  }

  async removeRelated(ticketId: string, relatedId: string, user: AuthUser) {
    await this.assertAccess(ticketId, user);
    await this.prisma.ticketRelation.deleteMany({
      where: { OR: [{ ticketId, relatedId }, { ticketId: relatedId, relatedId: ticketId }] },
    });
    return { ok: true };
  }

  async submitFeedback(ticketId: string, rating: number, comment: string | undefined, user: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.createdById !== user.id) throw new ForbiddenException('Only the ticket creator can submit feedback');
    if (ticket.status !== TicketStatus.RESOLVED && ticket.status !== TicketStatus.CLOSED) {
      throw new BadRequestException('Feedback can only be submitted on resolved or closed tickets');
    }
    return this.prisma.ticketFeedback.upsert({
      where: { ticketId },
      update: { rating, comment: comment ?? null },
      create: { ticketId, rating, comment: comment ?? null },
    });
  }

  async addCC(ticketId: string, email: string, user: AuthUser) {
    await this.assertAccess(ticketId, user);
    const cc = await this.prisma.ticketCC.upsert({
      where: { ticketId_email: { ticketId, email } },
      update: {},
      create: { ticketId, email, addedById: user.id },
    });
    return cc;
  }

  async removeCC(ticketId: string, email: string, user: AuthUser) {
    await this.assertAccess(ticketId, user);
    await this.prisma.ticketCC.deleteMany({ where: { ticketId, email } });
    return { removed: true };
  }

  async exportCsv(user: AuthUser, q: any): Promise<string> {
    const where: any = {};
    if (user.role === Role.CUSTOMER) {
      where.OR = [
        { createdById: user.id },
        { watchers: { some: { userId: user.id } } },
      ];
    } else {
      if (q.mine === 'true') where.assignedToId = user.id;
      if (q.assignedToId) where.assignedToId = q.assignedToId;
    }
    if (q.status) where.status = Array.isArray(q.status) ? { in: q.status } : q.status;
    if (q.priority) where.priority = Array.isArray(q.priority) ? { in: q.priority } : q.priority;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.q) {
      where.AND = [{
        OR: [
          { subject: { contains: q.q, mode: 'insensitive' } },
          { reference: { contains: q.q, mode: 'insensitive' } },
        ],
      }];
    }
    const tickets = await this.prisma.ticket.findMany({
      where,
      include: {
        category: { select: { name: true } },
        subcategory: { select: { name: true } },
        assignedTo: { select: { fullName: true } },
        createdBy: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const escape = (v: string | null | undefined) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const headers = ['Reference', 'Subject', 'Status', 'Priority', 'Category', 'Subcategory', 'Customer', 'Customer Email', 'Assignee', 'Created'];
    const rows = tickets.map((t) => [
      escape(t.reference),
      escape(t.subject),
      escape(t.status),
      escape(t.priority),
      escape(t.category?.name),
      escape(t.subcategory?.name),
      escape(t.createdBy.fullName),
      escape(t.createdBy.email),
      escape(t.assignedTo?.fullName),
      escape(t.createdAt.toISOString()),
    ].join(','));

    return [headers.join(','), ...rows].join('\r\n');
  }

  async exportXlsx(user: AuthUser, q: any): Promise<Buffer> {
    const where: any = {};
    if (user.role === Role.CUSTOMER) {
      where.OR = [
        { createdById: user.id },
        { watchers: { some: { userId: user.id } } },
      ];
    } else {
      if (q.mine === 'true') where.assignedToId = user.id;
      if (q.assignedToId) where.assignedToId = q.assignedToId;
    }
    if (q.status) where.status = Array.isArray(q.status) ? { in: q.status } : q.status;
    if (q.priority) where.priority = Array.isArray(q.priority) ? { in: q.priority } : q.priority;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.q) {
      where.AND = [{
        OR: [
          { subject: { contains: q.q, mode: 'insensitive' } },
          { reference: { contains: q.q, mode: 'insensitive' } },
        ],
      }];
    }
    const tickets = await this.prisma.ticket.findMany({
      where,
      include: {
        category: { select: { name: true } },
        subcategory: { select: { name: true } },
        assignedTo: { select: { fullName: true } },
        createdBy: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const rows = tickets.map((t) => ({
      'Ticket No.':     t.reference,
      Subject:          t.subject,
      Status:           t.status,
      Priority:         t.priority,
      Category:         t.category?.name ?? '',
      Subcategory:      t.subcategory?.name ?? '',
      Customer:         t.createdBy.fullName,
      'Customer Email': t.createdBy.email,
      Assignee:         t.assignedTo?.fullName ?? '',
      'SLA Breached':   t.slaBreached ? 'Yes' : 'No',
      'Resolution Due': t.slaResolutionDueAt?.toISOString() ?? '',
      Created:          t.createdAt.toISOString(),
      Updated:          t.updatedAt.toISOString(),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    // Auto column widths
    const colWidths = Object.keys(rows[0] ?? {}).map((k) => ({ wch: Math.max(k.length, 14) }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async getOne(id: string, user: AuthUser) {
    await this.assertAccess(id, user);
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        category: true,
        subcategory: true,
        assignedTo: { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true, email: true, phone: true, organization: true } },
        assignees: { include: { user: { select: { id: true, fullName: true, email: true, role: true } } } },
        watchers: { include: { user: { select: { id: true, fullName: true } } } },
        attachments: { orderBy: { createdAt: 'asc' } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, fullName: true, role: true } },
            attachments: true,
            reactions: { include: { user: { select: { id: true, fullName: true } } } },
          },
        },
        events: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, fullName: true } } },
        },
        tags: { include: { tag: true } },
        timeLogs: {
          orderBy: { loggedAt: 'asc' },
          include: { user: { select: { id: true, fullName: true } } },
        },
        ccRecipients: { orderBy: { addedAt: 'asc' }, include: { addedBy: { select: { id: true, fullName: true } } } },
        feedback: true,
        escalation: { include: { escalatedBy: { select: { id: true, fullName: true } } } },
        changeRequest: true,
        relations: { include: { related: { select: { id: true, reference: true, subject: true, status: true, priority: true } } } },
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
      await this.writeEvent(id, EventType.PRIORITY_CHANGED, user.id, ticket.priority, dto.priority);
    }
    if ('categoryId' in dto && dto.categoryId !== ticket.categoryId) {
      await this.writeEvent(id, EventType.CATEGORY_CHANGED, user.id, ticket.categoryId ?? undefined, dto.categoryId ?? undefined);
    }
    if ('subcategoryId' in dto && dto.subcategoryId !== ticket.subcategoryId) {
      await this.writeEvent(id, EventType.SUBCATEGORY_CHANGED, user.id, ticket.subcategoryId ?? undefined, dto.subcategoryId ?? undefined);
    }
    if ('deliveryDate' in dto && dto.deliveryDate) {
      await this.writeEvent(id, EventType.DELIVERY_DATE_SET, user.id, undefined, dto.deliveryDate);
    }
    const data: any = { ...dto };
    if (dto.deliveryDate) data.deliveryDate = new Date(dto.deliveryDate);
    return this.prisma.ticket.update({ where: { id }, data });
  }

  async toggleTag(ticketId: string, tagId: string, user: AuthUser) {
    await this.assertAccess(ticketId, user);
    const existing = await this.prisma.ticketTag.findUnique({
      where: { ticketId_tagId: { ticketId, tagId } },
    });
    if (existing) {
      await this.prisma.ticketTag.delete({ where: { ticketId_tagId: { ticketId, tagId } } });
      const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
      await this.writeEvent(ticketId, EventType.TAG_REMOVED, user.id, undefined, tag?.name);
      return { toggled: 'removed', tagId };
    }
    await this.prisma.ticketTag.create({ data: { ticketId, tagId } });
    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    await this.writeEvent(ticketId, EventType.TAG_ADDED, user.id, undefined, tag?.name);
    return { toggled: 'added', tagId };
  }

  async addTimeLog(ticketId: string, dto: TimeLogDto, user: AuthUser) {
    await this.assertAccess(ticketId, user);
    const log = await this.prisma.ticketTimeLog.create({
      data: {
        ticketId,
        userId: user.id,
        type: dto.type,
        hours: dto.hours,
        billable: dto.billable ?? true,
        note: dto.note ?? null,
      },
      include: { user: { select: { id: true, fullName: true } } },
    });
    await this.writeEvent(ticketId, EventType.TIME_LOGGED, user.id, undefined, `${dto.hours}h ${dto.type}`);
    return log;
  }

  async bulkAction(dto: { ids: string[]; action: string; payload?: any }, user: AuthUser) {
    const results: any[] = [];
    for (const id of dto.ids) {
      try {
        if (dto.action === 'close') {
          await this.changeStatus(id, TicketStatus.CLOSED, user);
        } else if (dto.action === 'resolve') {
          await this.changeStatus(id, TicketStatus.RESOLVED, user);
        } else if (dto.action === 'assign' && dto.payload?.userId) {
          await this.assign(id, [dto.payload.userId], user);
        } else if (dto.action === 'priority' && dto.payload?.priority) {
          await this.update(id, { priority: dto.payload.priority }, user);
        } else if (dto.action === 'delete') {
          if (user.role !== Role.ADMIN) throw new ForbiddenException('Admins only');
          await this.prisma.ticket.delete({ where: { id } });
        }
        results.push({ id, ok: true });
      } catch (e: any) {
        results.push({ id, ok: false, error: e.message });
      }
    }
    return { results };
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

  async assign(id: string, userIds: string[], user: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException();

    if (userIds.length === 0) {
      // Unassign
      await this.prisma.ticketAssignee.deleteMany({ where: { ticketId: id } });
      await this.prisma.ticket.update({ where: { id }, data: { assignedToId: null } });
      await this.writeEvent(id, EventType.ASSIGNED, user.id, ticket.assignedToId ?? undefined, undefined);
      return { ok: true };
    }

    const agents = await this.prisma.user.findMany({
      where: { id: { in: userIds }, role: { in: [Role.AGENT, Role.ADMIN] } },
    });
    if (agents.length !== userIds.length) {
      throw new BadRequestException('All assignees must be agents or admins');
    }

    const primaryId = userIds[0];
    const data: any = { assignedToId: primaryId };
    if (ticket.status === TicketStatus.NEW) data.status = TicketStatus.OPEN;
    await this.prisma.ticket.update({ where: { id }, data });

    // Sync assignees table
    await this.prisma.ticketAssignee.deleteMany({ where: { ticketId: id } });
    await this.prisma.ticketAssignee.createMany({
      data: userIds.map((uid) => ({ ticketId: id, userId: uid })),
    });

    // Add all assignees as watchers
    for (const uid of userIds) await this.addWatcherSilent(id, uid);

    const primary = agents.find((a) => a.id === primaryId)!;
    await this.writeEvent(
      id,
      EventType.ASSIGNED,
      user.id,
      ticket.assignedToId ?? undefined,
      primaryId,
    );
    this.emit({
      type: EventType.ASSIGNED,
      ticketId: id,
      reference: ticket.reference,
      subject: ticket.subject,
      actorId: user.id,
      detail: `Assigned to ${agents.map((a) => a.fullName).join(', ')}`,
    });
    return { ok: true, primary };
  }

  async editMessage(ticketId: string, msgId: string, body: string, user: AuthUser) {
    const msg = await this.prisma.message.findFirst({ where: { id: msgId, ticketId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.authorId !== user.id) throw new ForbiddenException('Can only edit your own messages');
    return this.prisma.message.update({
      where: { id: msgId },
      data: { body, editedAt: new Date() },
    });
  }

  async deleteMessage(ticketId: string, msgId: string, user: AuthUser) {
    const msg = await this.prisma.message.findFirst({ where: { id: msgId, ticketId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.authorId !== user.id && user.role === Role.CUSTOMER) {
      throw new ForbiddenException('Cannot delete this message');
    }
    return this.prisma.message.update({
      where: { id: msgId },
      data: { deletedAt: new Date() },
    });
  }

  async toggleReaction(ticketId: string, msgId: string, emoji: string, user: AuthUser) {
    await this.assertAccess(ticketId, user);
    const existing = await this.prisma.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId: msgId, userId: user.id, emoji } },
    });
    if (existing) {
      await this.prisma.reaction.delete({
        where: { messageId_userId_emoji: { messageId: msgId, userId: user.id, emoji } },
      });
      return { toggled: 'removed', emoji };
    }
    await this.prisma.reaction.create({ data: { messageId: msgId, userId: user.id, emoji } });
    return { toggled: 'added', emoji };
  }

  async deleteAttachment(attachmentId: string, user: AuthUser) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw new NotFoundException('Attachment not found');
    if (attachment.ticketId) await this.assertAccess(attachment.ticketId, user);
    try {
      const filePath = join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads', attachment.storageKey);
      unlinkSync(filePath);
    } catch { /* file may already be gone */ }
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
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

  async generatePdf(ticketId: string, user: AuthUser): Promise<Buffer> {
    const ticket = await this.getOne(ticketId, user);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const GRAY = '#6b7280';
      const DARK = '#111827';
      const LINE = '#e5e7eb';

      function section(title: string) {
        doc.moveDown(0.6);
        doc.fontSize(9).fillColor(GRAY).text(title.toUpperCase(), { characterSpacing: 1 });
        doc.moveDown(0.15);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(LINE).lineWidth(0.5).stroke();
        doc.moveDown(0.25);
      }

      function row(label: string, value: string | null | undefined) {
        if (!value) return;
        doc.fontSize(9).fillColor(GRAY).text(label + ':', { continued: false, indent: 0 });
        doc.moveUp(1);
        doc.fontSize(9).fillColor(DARK).text(value, { indent: 110, align: 'left' });
        doc.moveDown(0.15);
      }

      // Header
      doc.fontSize(18).fillColor(DARK).text(`Ticket ${ticket.reference}`, { align: 'left' });
      doc.fontSize(12).fillColor(GRAY).text(ticket.subject, { align: 'left' });
      doc.moveDown(0.4);

      // Status badges line
      doc.fontSize(9).fillColor(GRAY).text(
        `Status: ${ticket.status}  |  Priority: ${ticket.priority}  |  Channel: ${ticket.channel}` +
        (ticket.slaBreached ? '  |  SLA: BREACHED' : ''),
      );
      doc.moveDown(0.3);

      // Customer
      section('Customer');
      const cb = ticket.createdBy as any;
      if (cb) {
        row('Name', cb.fullName);
        row('Email', cb.email);
        row('Phone', cb.phone);
        row('Organization', cb.organization);
      }

      // Ticket Info
      section('Ticket Details');
      row('Ticket No.', ticket.reference);
      row('Category', (ticket as any).category?.name ?? null);
      row('Subcategory', (ticket as any).subcategory?.name ?? null);
      row('Assigned To', (ticket as any).assignees?.length
        ? (ticket as any).assignees.map((a: any) => a.user?.fullName ?? '').join(', ')
        : (ticket as any).assignedTo?.fullName ?? null);
      row('Created', new Date(ticket.createdAt).toLocaleString());
      row('Updated', new Date(ticket.updatedAt).toLocaleString());
      row('Resolved', ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleString() : null);
      row('Delivery Date', ticket.deliveryDate ? new Date(ticket.deliveryDate).toLocaleString() : null);
      if ((ticket as any).slaResolutionDueAt) row('SLA Resolution Due', new Date((ticket as any).slaResolutionDueAt).toLocaleString());
      if ((ticket as any).tags?.length) row('Tags', (ticket as any).tags.map((t: any) => t.tag?.name).filter(Boolean).join(', '));

      // System Info
      const sys = ticket as any;
      if (sys.systemProduct || sys.systemModule || sys.systemBrowser || sys.systemOs) {
        section('System Info');
        row('Product', sys.systemProduct);
        row('Module', sys.systemModule);
        row('Version', sys.systemVersion);
        row('Browser', sys.systemBrowser);
        row('OS', sys.systemOs);
      }

      // Resolution
      if (ticket.resolutionSummary || ticket.rootCause) {
        section('Resolution');
        row('Summary', ticket.resolutionSummary);
        row('Root Cause', ticket.rootCause);
        row('Corrective Action', ticket.correctiveAction);
        row('Preventive Action', ticket.preventiveAction);
      }

      // Time Tracking
      const timeLogs: any[] = (ticket as any).timeLogs ?? [];
      if (timeLogs.length > 0) {
        section('Time Tracking');
        const byType: Record<string, number> = {};
        let total = 0;
        for (const tl of timeLogs) { byType[tl.type] = (byType[tl.type] ?? 0) + tl.hours; total += tl.hours; }
        for (const [type, hours] of Object.entries(byType)) row(type.charAt(0) + type.slice(1).toLowerCase(), `${hours}h`);
        row('Total', `${total}h`);
      }

      // Messages
      const messages: any[] = (ticket as any).messages?.filter((m: any) => !m.deletedAt) ?? [];
      if (messages.length > 0) {
        section('Conversation');
        for (const m of messages) {
          const author = m.author?.fullName ?? 'System';
          const when = new Date(m.createdAt).toLocaleString();
          const typeLabel = m.type === 'INTERNAL_NOTE' ? ' [Internal]' : '';
          doc.fontSize(8.5).fillColor(GRAY).text(`${author} · ${when}${typeLabel}`);
          const plain = (m.body ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          doc.fontSize(9).fillColor(DARK).text(plain.length > 600 ? plain.slice(0, 600) + '…' : plain, { indent: 0 });
          doc.moveDown(0.4);
        }
      }

      // Footer
      doc.fontSize(8).fillColor(GRAY).text(
        `Generated ${new Date().toLocaleString()} — HelpDesk`,
        50, 790, { align: 'center' },
      );

      doc.end();
    });
  }
}
