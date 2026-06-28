import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { STATUS_LABELS, avatarStyle, avatarInitials } from '../utils';

const STATUS_BAR_COLOR: Record<string, string> = {
  NEW: '#0369a1',
  OPEN: '#16a34a',
  IN_PROGRESS: '#2563eb',
  PENDING_CUSTOMER: '#c2410c',
  RESOLVED: '#15803d',
  CLOSED: '#6b7280',
  REOPENED: '#b91c1c',
};

const TIMELOG_TYPE_LABELS: Record<string, string> = {
  INVESTIGATION: 'Investigation',
  DEVELOPMENT: 'Development',
  TESTING: 'Testing',
  OTHER: 'Other',
};

interface TimeLogUser { id: string; fullName: string; email: string; }
interface TimeLogRow {
  id: string;
  type: string;
  hours: number;
  billable: boolean;
  note: string | null;
  loggedAt: string;
  user: TimeLogUser;
  ticket: { id: string; reference: string; subject: string };
}
interface TimeLogUserTotal { user: TimeLogUser; totalHours: number; billableHours: number; }
interface TimeLogResponse { rows: TimeLogRow[]; userTotals: TimeLogUserTotal[]; }

function monthBounds(month: string) {
  // month is "YYYY-MM"
  const [y, m] = month.split('-').map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0); // last day of month
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: iso(from), to: iso(to) };
}

const fmtHours = (h: number) => `${(Math.round(h * 100) / 100)}h`;

export default function Reports() {
  const { user } = useAuth();
  const { data: summary, isLoading: loadSummary } = useQuery({
    queryKey: ['rep-summary'],
    queryFn: async () => (await api.get('/reports/summary')).data,
  });
  const { data: sla, isLoading: loadSla } = useQuery({
    queryKey: ['rep-sla'],
    queryFn: async () => (await api.get('/reports/sla')).data,
    enabled: user?.role === 'ADMIN',
  });

  // Time-log report — defaults to the current month.
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const { from, to } = monthBounds(month);
  const { data: timelog, isLoading: loadTimelog } = useQuery<TimeLogResponse>({
    queryKey: ['rep-timelog', from, to],
    queryFn: async () => (await api.get('/reports/timelog', { params: { from, to } })).data,
  });
  const monthGrandTotal = timelog?.userTotals.reduce((acc, u) => acc + u.totalHours, 0) ?? 0;

  async function downloadTimelog(format: 'csv' | 'pdf') {
    const res = await api.get(`/reports/timelog/export-${format}`, {
      params: { from, to },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `timelog-${month}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const byStatus: Record<string, number> = {};
  summary?.byStatus?.forEach((r: any) => (byStatus[r.status] = Number(r._count)));
  const total: number = summary?.total ?? 0;

  const open   = (byStatus['OPEN'] ?? 0) + (byStatus['IN_PROGRESS'] ?? 0) + (byStatus['NEW'] ?? 0);
  const pending = byStatus['PENDING_CUSTOMER'] ?? 0;
  const resolved = (byStatus['RESOLVED'] ?? 0) + (byStatus['CLOSED'] ?? 0);

  const slaBreaches = sla?.slaBreaches ?? 0;
  const avgResponse = sla?.avgFirstResponseMins != null ? `${Math.round(sla.avgFirstResponseMins)} min` : '—';
  const avgResolution = sla?.avgResolutionMins != null ? `${Math.round(sla.avgResolutionMins)} min` : '—';

  const maxCount = Math.max(1, ...Object.values(byStatus));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Reports &amp; Dashboard</div>
          <div className="page-subtitle">Overview of support activity and team performance.</div>
        </div>
        {user?.role === 'ADMIN' && (
          <a className="btn btn-secondary" href="/api/v1/reports/export" target="_blank" rel="noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </a>
        )}
      </div>

      {/* KPI stat cards */}
      {loadSummary ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)', marginBottom: 24 }}>
          <span className="spinner" /> Loading metrics…
        </div>
      ) : (
        <div className="stats-grid">
          <div className="stat-card blue">
            <div className="stat-label">Total tickets</div>
            <div className="stat-value">{total}</div>
            <div className="stat-sub">All time</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-label">Open</div>
            <div className="stat-value">{open}</div>
            <div className="stat-sub">New + Open + In Progress</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-label">Pending customer</div>
            <div className="stat-value">{pending}</div>
            <div className="stat-sub">Awaiting customer reply</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Resolved</div>
            <div className="stat-value">{resolved}</div>
            <div className="stat-sub">Resolved + Closed</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: user?.role === 'ADMIN' ? '1fr 1fr' : '1fr', gap: 16 }}>
        {/* Status breakdown */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Tickets by status</span>
          </div>
          {loadSummary ? (
            <div className="muted">Loading…</div>
          ) : (
            summary?.byStatus?.map((r: any) => (
              <div key={r.status} className="breakdown-row">
                <span className={`badge ${r.status}`} style={{ minWidth: 130 }}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
                <div className="breakdown-bar-wrap">
                  <div
                    className="breakdown-bar"
                    style={{
                      width: `${(Number(r._count) / maxCount) * 100}%`,
                      background: STATUS_BAR_COLOR[r.status] ?? '#2563eb',
                    }}
                  />
                </div>
                <span className="breakdown-count">{r._count}</span>
              </div>
            ))
          )}
        </div>

        {/* SLA */}
        {user?.role === 'ADMIN' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">SLA performance</span>
            </div>
            {loadSla ? (
              <div className="muted">Loading…</div>
            ) : (
              <>
                <div className="stats-grid" style={{ marginBottom: 0, gridTemplateColumns: '1fr 1fr' }}>
                  <div className={`stat-card ${slaBreaches > 0 ? 'red' : 'green'}`} style={{ padding: '12px 14px' }}>
                    <div className="stat-label">SLA Breaches</div>
                    <div className="stat-value" style={{ fontSize: 24 }}>{slaBreaches}</div>
                  </div>
                  <div className="stat-card blue" style={{ padding: '12px 14px' }}>
                    <div className="stat-label">Avg first response</div>
                    <div className="stat-value" style={{ fontSize: 24 }}>{avgResponse}</div>
                  </div>
                </div>
                <div className="divider" />
                <div className="meta-section">
                  <div className="meta-label">Avg resolution time</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{avgResolution}</div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Time-log report */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <span className="card-title">Time logged</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            <label className="muted" style={{ fontSize: 13 }}>Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ width: 'auto', marginBottom: 0 }}
            />
            <span className="badge" style={{ background: 'var(--brand-bg)', color: 'var(--brand)' }}>
              {fmtHours(monthGrandTotal)} total
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => downloadTimelog('csv')}
              disabled={!timelog || timelog.rows.length === 0}
            >↓ CSV</button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => downloadTimelog('pdf')}
              disabled={!timelog || timelog.rows.length === 0}
            >↓ PDF</button>
          </div>
        </div>

        {loadTimelog ? (
          <div className="muted">Loading…</div>
        ) : !timelog || timelog.rows.length === 0 ? (
          <div className="empty-state">No time logged in this month.</div>
        ) : (
          <>
            {/* Total per user for the month */}
            <div className="meta-label" style={{ marginBottom: 8 }}>Total per user</div>
            <div className="table-wrap" style={{ marginBottom: 20 }}>
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th style={{ textAlign: 'right' }}>Billable</th>
                    <th style={{ textAlign: 'right' }}>Total hours</th>
                  </tr>
                </thead>
                <tbody>
                  {timelog.userTotals.map((u) => (
                    <tr key={u.user.id}>
                      <td>
                        <div className="user-cell">
                          <span className="avatar avatar-sm" style={avatarStyle(u.user.fullName)}>
                            {avatarInitials(u.user.fullName)}
                          </span>
                          <span>{u.user.fullName}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }} className="muted">{fmtHours(u.billableHours)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtHours(u.totalHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Per-user, per-ticket detail */}
            <div className="meta-label" style={{ marginBottom: 8 }}>Detail by ticket</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Ticket</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {timelog.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.user.fullName}</td>
                      <td>
                        <Link to={`/tickets/${r.ticket.id}`} style={{ fontWeight: 600 }}>{r.ticket.reference}</Link>
                        <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>{r.ticket.subject}</span>
                      </td>
                      <td><span className="badge">{TIMELOG_TYPE_LABELS[r.type] ?? r.type}</span></td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {new Date(r.loggedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {fmtHours(r.hours)}
                        {!r.billable && <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>(non-bill)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
