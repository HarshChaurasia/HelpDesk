import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators';

function range(q: any) {
  const from = q.from ? new Date(q.from) : new Date(0);
  const to = q.to ? new Date(q.to) : new Date();
  return { from, to };
}

@ApiTags('reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('AGENT', 'ADMIN')
  @Get('summary')
  async summary(@Query() q: any) {
    const { from, to } = range(q);
    const where: any = { createdAt: { gte: from, lte: to } };
    if (q.categoryId) where.categoryId = q.categoryId;
    const [byStatus, byPriority, byCategory, total] = await Promise.all([
      this.prisma.ticket.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.ticket.groupBy({ by: ['priority'], where, _count: true }),
      this.prisma.ticket.groupBy({ by: ['categoryId'], where, _count: true }),
      this.prisma.ticket.count({ where }),
    ]);
    return { total, byStatus, byPriority, byCategory };
  }

  @Roles('ADMIN')
  @Get('agent-workload')
  async workload() {
    const rows = await this.prisma.ticket.groupBy({
      by: ['assignedToId', 'status'],
      where: { assignedToId: { not: null } },
      _count: true,
    });
    return rows;
  }

  @Roles('ADMIN')
  @Get('sla')
  async sla(@Query() q: any) {
    const { from, to } = range(q);
    const where = { createdAt: { gte: from, lte: to } };
    const [breached, resolved] = await Promise.all([
      this.prisma.ticket.count({ where: { ...where, slaBreached: true } }),
      this.prisma.ticket.findMany({
        where: { ...where, resolvedAt: { not: null } },
        select: { createdAt: true, firstResponseAt: true, resolvedAt: true },
      }),
    ]);
    const avg = (xs: number[]) =>
      xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
    const frMins = resolved
      .filter((t) => t.firstResponseAt)
      .map(
        (t) =>
          (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 60000,
      );
    const resMins = resolved.map(
      (t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60000,
    );
    return {
      slaBreaches: breached,
      avgFirstResponseMins: avg(frMins),
      avgResolutionMins: avg(resMins),
      resolvedCount: resolved.length,
    };
  }

  @Roles('ADMIN')
  @Get('trends')
  async trends(@Query() q: any) {
    const { from, to } = range(q);
    const created = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT date_trunc('day', "createdAt") d, count(*)::int c
       FROM "Ticket" WHERE "createdAt" BETWEEN $1 AND $2
       GROUP BY 1 ORDER BY 1`,
      from,
      to,
    );
    const resolved = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT date_trunc('day', "resolvedAt") d, count(*)::int c
       FROM "Ticket" WHERE "resolvedAt" BETWEEN $1 AND $2
       GROUP BY 1 ORDER BY 1`,
      from,
      to,
    );
    return { created, resolved };
  }

  @Roles('ADMIN')
  @Get('export')
  async export(@Query() q: any, @Res() res: Response) {
    const { from, to } = range(q);
    const tickets = await this.prisma.ticket.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: {
        category: true,
        assignedTo: { select: { email: true } },
        createdBy: { select: { email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const esc = (v: unknown) =>
      `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'reference',
      'subject',
      'status',
      'priority',
      'category',
      'customer',
      'assignedTo',
      'slaBreached',
      'createdAt',
      'resolvedAt',
    ].join(',');
    const lines = tickets.map((t) =>
      [
        t.reference,
        t.subject,
        t.status,
        t.priority,
        t.category?.name ?? '',
        t.createdBy?.email ?? '',
        t.assignedTo?.email ?? '',
        t.slaBreached,
        t.createdAt.toISOString(),
        t.resolvedAt?.toISOString() ?? '',
      ]
        .map(esc)
        .join(','),
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="tickets.csv"',
    );
    res.send([header, ...lines].join('\n'));
  }
}
