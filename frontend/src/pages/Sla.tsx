import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { STATUS_LABELS, PRIORITY_LABELS, relativeTime } from '../utils';

const CLOSED_STATUSES = new Set(['RESOLVED', 'CLOSED']);

function SlaTable({ tickets, emptyText }: { tickets: any[]; emptyText: string }) {
  if (tickets.length === 0) {
    return <div className="muted" style={{ fontSize: 13, padding: '12px 0' }}>{emptyText}</div>;
  }
  return (
    <table className="data-table" style={{ marginTop: 8 }}>
      <thead>
        <tr>
          <th>Ref</th>
          <th>Subject</th>
          <th>Priority</th>
          <th>Status</th>
          <th>Customer</th>
          <th>Assignee</th>
          <th>Response Due</th>
          <th>Resolution Due</th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((t: any) => {
          const resDue = t.slaResolutionDueAt ? new Date(t.slaResolutionDueAt) : null;
          const respDue = t.slaResponseDueAt ? new Date(t.slaResponseDueAt) : null;
          const now = new Date();
          return (
            <tr key={t.id}>
              <td>
                <Link to={`/tickets/${t.id}`} style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.reference}</Link>
              </td>
              <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Link to={`/tickets/${t.id}`}>{t.subject}</Link>
              </td>
              <td><span className={`badge ${t.priority}`}>{PRIORITY_LABELS[t.priority] ?? t.priority}</span></td>
              <td><span className={`badge ${t.status}`}>{STATUS_LABELS[t.status] ?? t.status}</span></td>
              <td style={{ fontSize: 12 }}>{t.createdBy?.fullName ?? '—'}</td>
              <td style={{ fontSize: 12 }}>{t.assignedTo?.fullName ?? <span className="muted">Unassigned</span>}</td>
              <td style={{ fontSize: 12, color: respDue && respDue < now ? '#dc2626' : 'var(--text)' }}>
                {respDue ? relativeTime(t.slaResponseDueAt) : '—'}
              </td>
              <td style={{ fontSize: 12, color: resDue && resDue < now ? '#dc2626' : resDue && (resDue.getTime() - now.getTime()) < 7200000 ? '#d97706' : 'var(--text)' }}>
                {resDue ? relativeTime(t.slaResolutionDueAt) : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function Sla() {
  const { data: breachedData, isLoading: loadingBreached } = useQuery({
    queryKey: ['sla-breached'],
    queryFn: async () => (await api.get('/tickets', { params: { slaBreached: 'true', limit: 100 } })).data,
    refetchInterval: 60000,
  });

  const { data: activeData, isLoading: loadingActive } = useQuery({
    queryKey: ['sla-active'],
    queryFn: async () => (await api.get('/tickets', { params: { limit: 100 } })).data,
    refetchInterval: 60000,
  });

  const breached: any[] = breachedData?.data ?? [];

  const now = new Date();
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const atRisk: any[] = (activeData?.data ?? []).filter((t: any) => {
    if (t.slaBreached || CLOSED_STATUSES.has(t.status)) return false;
    if (!t.slaResolutionDueAt) return false;
    const due = new Date(t.slaResolutionDueAt);
    const remaining = due.getTime() - now.getTime();
    return remaining > 0 && remaining <= twoHoursMs;
  });

  const isLoading = loadingBreached || loadingActive;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">SLA Dashboard</div>
          <div className="page-subtitle">Monitor service level agreement status across all tickets</div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#dc2626' }}>{breached.length}</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>SLA Breached</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#d97706' }}>{atRisk.length}</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>At Risk (within 2h)</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>
            {(activeData?.meta?.total ?? 0) - breached.length - atRisk.length}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>On Track</div>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)' }}>
          <span className="spinner" /> Loading SLA data…
        </div>
      ) : (
        <>
          {/* Breached */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <span className="card-title" style={{ color: '#dc2626' }}>SLA Breached ({breached.length})</span>
            </div>
            <SlaTable tickets={breached} emptyText="No SLA breaches — great work!" />
          </div>

          {/* At Risk */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ color: '#d97706' }}>At Risk — Due Within 2 Hours ({atRisk.length})</span>
            </div>
            <SlaTable tickets={atRisk} emptyText="No tickets at risk right now." />
          </div>
        </>
      )}
    </div>
  );
}
