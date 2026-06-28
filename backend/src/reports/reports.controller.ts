import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TicketStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators';

function range(q: any) {
  const from = q.from ? new Date(q.from) : new Date(0);
  const to = q.to ? new Date(q.to) : new Date();
  return { from, to };
}

type TimelogRow = {
  type: string;
  hours: number;
  billable: boolean;
  note: string | null;
  loggedAt: Date;
  user: { fullName: string; email: string };
  ticket: { reference: string; subject: string };
};
type TimelogTotal = { user: { fullName: string; email: string }; totalHours: number; billableHours: number };

function buildTimelogPdf(
  from: Date,
  to: Date,
  rows: TimelogRow[],
  userTotals: TimelogTotal[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const GRAY = '#6b7280';
    const DARK = '#111827';
    const LINE = '#e5e7eb';
    const LEFT = 50;
    const RIGHT = 545;
    const fmtH = (h: number) => `${Math.round(h * 100) / 100}h`;
    const fmtDate = (d: Date) => new Date(d).toISOString().slice(0, 10);

    // Header
    doc.fontSize(18).fillColor(DARK).text('Time Log Report', LEFT);
    doc.fontSize(10).fillColor(GRAY).text(`${fmtDate(from)}  to  ${fmtDate(to)}`);
    const grand = userTotals.reduce((a, u) => a + u.totalHours, 0);
    doc.text(`Total logged: ${fmtH(grand)}`);
    doc.moveDown(0.6);

    function section(title: string) {
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor(GRAY).text(title.toUpperCase(), LEFT, doc.y, { characterSpacing: 1 });
      doc.moveDown(0.15);
      doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.moveDown(0.3);
    }

    // Draws one table row at the current y, returns the new y.
    function tableRow(cols: { x: number; w: number; text: string; align?: 'left' | 'right'; bold?: boolean }[], header = false) {
      const y = doc.y;
      doc.fontSize(9).fillColor(header ? GRAY : DARK);
      let maxH = 0;
      for (const c of cols) {
        const h = doc.heightOfString(c.text, { width: c.w, align: c.align ?? 'left' });
        if (h > maxH) maxH = h;
      }
      for (const c of cols) {
        doc.font(header || c.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(c.text, c.x, y, { width: c.w, align: c.align ?? 'left' });
      }
      doc.font('Helvetica');
      doc.y = y + maxH + 4;
      if (header) {
        doc.moveTo(LEFT, doc.y - 2).lineTo(RIGHT, doc.y - 2).strokeColor(LINE).lineWidth(0.5).stroke();
        doc.moveDown(0.2);
      }
      // Page break guard
      if (doc.y > 760) doc.addPage();
    }

    // Per-user totals
    section('Total per user');
    tableRow([
      { x: LEFT, w: 240, text: 'User' },
      { x: LEFT + 250, w: 120, text: 'Billable', align: 'right' },
      { x: LEFT + 375, w: 120, text: 'Total hours', align: 'right' },
    ], true);
    for (const u of userTotals) {
      tableRow([
        { x: LEFT, w: 240, text: u.user.fullName },
        { x: LEFT + 250, w: 120, text: fmtH(u.billableHours), align: 'right' },
        { x: LEFT + 375, w: 120, text: fmtH(u.totalHours), align: 'right', bold: true },
      ]);
    }

    // Per-ticket detail
    section('Detail by ticket');
    tableRow([
      { x: LEFT, w: 95, text: 'User' },
      { x: LEFT + 100, w: 90, text: 'Ticket' },
      { x: LEFT + 195, w: 110, text: 'Type' },
      { x: LEFT + 310, w: 90, text: 'Date' },
      { x: LEFT + 405, w: 90, text: 'Hours', align: 'right' },
    ], true);
    for (const r of rows) {
      tableRow([
        { x: LEFT, w: 95, text: r.user.fullName },
        { x: LEFT + 100, w: 90, text: r.ticket.reference },
        { x: LEFT + 195, w: 110, text: r.type },
        { x: LEFT + 310, w: 90, text: fmtDate(r.loggedAt) },
        { x: LEFT + 405, w: 90, text: fmtH(r.hours) + (r.billable ? '' : ' (nb)'), align: 'right' },
      ]);
    }

    doc.end();
  });
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

  // Shared query + aggregation for the time-log report and its exports.
  private async timelogData(q: any) {
    const { from, to } = range(q);
    // Set `to` to end-of-day so the selected date is inclusive
    to.setHours(23, 59, 59, 999);
    const rows = await this.prisma.ticketTimeLog.findMany({
      where: { loggedAt: { gte: from, lte: to } },
      include: {
        user:   { select: { id: true, fullName: true, email: true } },
        ticket: { select: { id: true, reference: true, subject: true } },
      },
      orderBy: { loggedAt: 'desc' },
    });

    // Per-user totals
    const userMap = new Map<string, { user: any; totalHours: number; billableHours: number }>();
    for (const row of rows) {
      if (!userMap.has(row.userId)) {
        userMap.set(row.userId, { user: row.user, totalHours: 0, billableHours: 0 });
      }
      const entry = userMap.get(row.userId)!;
      entry.totalHours += row.hours;
      if (row.billable) entry.billableHours += row.hours;
    }

    const userTotals = [...userMap.values()].sort((a, b) => b.totalHours - a.totalHours);
    return { from, to, rows, userTotals };
  }

  @Roles('AGENT', 'ADMIN')
  @Get('timelog')
  async timelog(@Query() q: any) {
    const { rows, userTotals } = await this.timelogData(q);
    return { rows, userTotals };
  }

  @Roles('AGENT', 'ADMIN')
  @Get('timelog/export-csv')
  async timelogCsv(@Query() q: any, @Res() res: Response) {
    const { rows, userTotals } = await this.timelogData(q);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines: string[] = [];

    lines.push('Time logged per user');
    lines.push(['User', 'Email', 'Billable hours', 'Total hours'].map(esc).join(','));
    for (const u of userTotals) {
      lines.push([u.user.fullName, u.user.email, u.billableHours, u.totalHours].map(esc).join(','));
    }

    lines.push('');
    lines.push('Detail by ticket');
    lines.push(['User', 'Ticket', 'Subject', 'Type', 'Billable', 'Hours', 'Date', 'Note'].map(esc).join(','));
    for (const r of rows) {
      lines.push([
        r.user.fullName,
        r.ticket.reference,
        r.ticket.subject,
        r.type,
        r.billable ? 'Yes' : 'No',
        r.hours,
        new Date(r.loggedAt).toISOString().slice(0, 10),
        r.note ?? '',
      ].map(esc).join(','));
    }

    const filename = `timelog-${q.from ?? 'all'}.csv`;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send('﻿' + lines.join('\n'));
  }

  @Roles('AGENT', 'ADMIN')
  @Get('timelog/export-pdf')
  async timelogPdf(@Query() q: any, @Res() res: Response) {
    const { from, to, rows, userTotals } = await this.timelogData(q);
    const buf = await buildTimelogPdf(from, to, rows, userTotals);
    const filename = `timelog-${q.from ?? 'all'}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buf.length,
    });
    res.send(buf);
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
