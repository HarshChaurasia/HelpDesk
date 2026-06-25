import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { STATUS_LABELS, PRIORITY_LABELS, relativeTime, formatDate } from '../utils';

export default function Escalations() {
  const { data, isLoading } = useQuery({
    queryKey: ['escalated-tickets'],
    queryFn: async () => (await api.get('/tickets', { params: { escalated: true, limit: 100 } })).data,
  });

  const { data: configData } = useQuery<{ escalationContacts: string[] }>({
    queryKey: ['admin-config'],
    queryFn: async () => (await api.get('/admin/config')).data,
  });
  const contacts = configData?.escalationContacts ?? [];

  const tickets: any[] = data?.data ?? [];
  const escalated = tickets.filter((t: any) => t.escalation && !t.escalation.resolvedAt);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Escalated Tickets</div>
          <div className="page-subtitle">All tickets currently requiring escalated attention.</div>
        </div>
      </div>

      {/* Escalation Contacts */}
      {contacts.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Escalation Contacts</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {contacts.map((c) => {
              const [label, rest] = c.includes(':') ? [c.split(':')[0].trim(), c.split(':').slice(1).join(':').trim()] : ['', c];
              return (
                <div key={c} style={{ background: 'var(--surface-sunken)', borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {label && <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '.04em' }}>{label}</span>}
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{rest}</span>
                </div>
              );
            })}
          </div>
          <div className="form-hint" style={{ marginTop: 8 }}>Configure contacts in Settings → Dropdowns → Escalation Contacts.</div>
        </div>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)', padding: 32 }}>
          <span className="skeleton" style={{ width: 200, height: 20 }} />
        </div>
      ) : escalated.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <div className="empty-state-title">No active escalations</div>
          <div className="empty-state-body">All tickets are within normal handling.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Subject</th>
                <th>Level</th>
                <th>Reason</th>
                <th>Escalated by</th>
                <th>Escalated at</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Assignee</th>
              </tr>
            </thead>
            <tbody>
              {escalated.map((ticket: any) => {
                const esc = ticket.escalation;
                const assignee = ticket.assignees?.[0]?.user ?? ticket.assignedTo;
                return (
                  <tr key={ticket.id}>
                    <td>
                      <Link to={`/tickets/${ticket.id}`} style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--brand)' }}>
                        {ticket.reference}
                      </Link>
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <Link to={`/tickets/${ticket.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                        {ticket.subject}
                      </Link>
                    </td>
                    <td>
                      <span className="badge" style={{ background: ['#fef3c7', '#fed7aa', '#fee2e2'][esc.level - 1] ?? '#fef3c7', color: ['#b45309', '#c2410c', '#b91c1c'][esc.level - 1] ?? '#b45309' }}>
                        L{esc.level}
                      </span>
                    </td>
                    <td style={{ maxWidth: 200, color: 'var(--text-2)', fontSize: 13 }}>
                      {esc.reason?.length > 60 ? esc.reason.slice(0, 60) + '…' : esc.reason}
                    </td>
                    <td style={{ fontSize: 13 }}>{esc.escalatedBy?.fullName ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }} title={formatDate(esc.createdAt)}>
                      {relativeTime(esc.createdAt)}
                    </td>
                    <td><span className={`badge ${ticket.status}`}>{STATUS_LABELS[ticket.status] ?? ticket.status}</span></td>
                    <td><span className={`badge ${ticket.priority}`}>{PRIORITY_LABELS[ticket.priority] ?? ticket.priority}</span></td>
                    <td style={{ fontSize: 13 }}>{assignee?.fullName ?? <span className="muted">Unassigned</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
