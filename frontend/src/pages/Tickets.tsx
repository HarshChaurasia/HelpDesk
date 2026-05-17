import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { STATUS_LABELS, PRIORITY_LABELS, avatarInitials, avatarStyle, relativeTime } from '../utils';

const STATUS_OPTIONS = ['', 'NEW', 'OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED', 'REOPENED'] as const;

function Avatar({ name }: { name: string }) {
  return (
    <div className="avatar avatar-sm" style={avatarStyle(name)} title={name}>
      {avatarInitials(name)}
    </div>
  );
}

export default function Tickets() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [scope, setScope] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tickets', status, scope],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      if (scope === 'mine') params.mine = 'true';
      if (scope === 'unassigned') params.unassigned = 'true';
      return (await api.get('/tickets', { params })).data;
    },
  });

  const isStaff = user?.role !== 'CUSTOMER';
  const tickets: any[] = data?.data ?? [];
  const total: number = data?.meta?.total ?? 0;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Tickets</div>
          {!isLoading && <div className="page-subtitle">{total} ticket{total !== 1 ? 's' : ''}</div>}
        </div>
        <Link to="/tickets/new" className="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"/><path d="M12 5v14"/>
          </svg>
          New Ticket
        </Link>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        {isStaff && (
          <div className="tab-group">
            {[
              { value: '', label: 'All' },
              { value: 'mine', label: 'Mine' },
              { value: 'unassigned', label: 'Unassigned' },
            ].map((t) => (
              <button
                key={t.value}
                type="button"
                className={`tab-btn${scope === t.value ? ' active' : ''}`}
                onClick={() => setScope(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto', minWidth: 150 }}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span className="spinner" /> Loading tickets…
        </div>
      ) : isError ? (
        <div className="alert alert-error">Failed to load tickets. Make sure the API is reachable.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Customer</th>
                {isStaff && <th>Assignee</th>}
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={isStaff ? 7 : 6}>
                    <div className="empty-state">
                      <div className="empty-state-icon">🎫</div>
                      <div className="empty-state-title">No tickets found</div>
                      <div className="empty-state-body">
                        {status ? 'Try changing the status filter.' : 'No tickets match your current view.'}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                tickets.map((t: any) => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/tickets/${t.id}`} className="ticket-ref" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                        {t.reference}
                      </Link>
                    </td>
                    <td>
                      <Link to={`/tickets/${t.id}`} style={{ color: 'var(--text)', fontWeight: 500 }}>
                        {t.subject}
                      </Link>
                    </td>
                    <td>
                      <span className={`badge ${t.status}`}>{STATUS_LABELS[t.status] ?? t.status}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`priority-dot ${t.priority}`} />
                        <span className={`badge ${t.priority}`}>{PRIORITY_LABELS[t.priority] ?? t.priority}</span>
                      </div>
                    </td>
                    <td>
                      {t.createdBy?.fullName ? (
                        <div className="user-cell">
                          <Avatar name={t.createdBy.fullName} />
                          <span style={{ fontSize: 13 }}>{t.createdBy.fullName}</span>
                        </div>
                      ) : '—'}
                    </td>
                    {isStaff && (
                      <td>
                        {t.assignedTo?.fullName ? (
                          <div className="user-cell">
                            <Avatar name={t.assignedTo.fullName} />
                            <span style={{ fontSize: 13 }}>{t.assignedTo.fullName}</span>
                          </div>
                        ) : (
                          <span className="muted">Unassigned</span>
                        )}
                      </td>
                    )}
                    <td className="muted">{relativeTime(t.updatedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
