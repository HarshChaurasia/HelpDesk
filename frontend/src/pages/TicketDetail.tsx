import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { STATUS_LABELS, PRIORITY_LABELS, avatarInitials, avatarStyle, relativeTime, formatDate } from '../utils';

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'avatar' : 'avatar avatar-sm';
  return (
    <div className={cls} style={avatarStyle(name)} title={name}>
      {avatarInitials(name)}
    </div>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: t, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => (await api.get(`/tickets/${id}`)).data,
  });
  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => (await api.get('/users/agents')).data,
    enabled: user?.role !== 'CUSTOMER',
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['ticket', id] });
  const isStaff = user?.role !== 'CUSTOMER';

  if (isLoading || !t) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)', padding: 32 }}>
        <span className="spinner" /> Loading ticket…
      </div>
    );
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await api.post(`/tickets/${id}/messages`, {
        body,
        type: internal ? 'INTERNAL_NOTE' : 'PUBLIC_REPLY',
      });
      setBody('');
      refresh();
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(status: string) {
    await api.post(`/tickets/${id}/status`, { status });
    refresh();
  }

  async function assign(assignedToId: string) {
    await api.post(`/tickets/${id}/assign`, { assignedToId });
    refresh();
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link to="/tickets">Tickets</Link>
        <span className="breadcrumb-sep">›</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.reference}</span>
      </div>

      {/* Ticket header */}
      <div className="ticket-header">
        <div className="ticket-header-row">
          <span className={`badge ${t.status}`}>{STATUS_LABELS[t.status] ?? t.status}</span>
          <span className={`badge ${t.priority}`}>{PRIORITY_LABELS[t.priority] ?? t.priority}</span>
        </div>
        <div className="ticket-subject">{t.subject}</div>
        <div className="muted" style={{ marginTop: 5 }}>
          Opened by <strong>{t.createdBy?.fullName ?? 'Unknown'}</strong>
          {' · '}{formatDate(t.createdAt)}
          {t.category && <> · {t.category.name}</>}
        </div>
      </div>

      <div className="ticket-layout">
        {/* Main — conversation */}
        <div className="ticket-main">
          {/* Messages */}
          <div className="message-list">
            {t.messages.map((m: any) => (
              <div key={m.id} className={`message ${m.type}`}>
                <div className="message-header">
                  <div className="message-author-row">
                    <Avatar name={m.author?.fullName ?? 'System'} />
                    <span className="message-name">{m.author?.fullName ?? 'System'}</span>
                    <span className="message-time" title={formatDate(m.createdAt)}>
                      {relativeTime(m.createdAt)}
                    </span>
                  </div>
                  {m.type === 'INTERNAL_NOTE' && (
                    <span className="message-tag">Internal note</span>
                  )}
                </div>
                <div className="message-body">{m.body}</div>
              </div>
            ))}
          </div>

          {/* Compose */}
          <div className="compose-box">
            {isStaff && (
              <div className="compose-tabs">
                <button
                  type="button"
                  className={`compose-tab${!internal ? ' active' : ''}`}
                  onClick={() => setInternal(false)}
                >
                  Reply
                </button>
                <button
                  type="button"
                  className={`compose-tab${internal ? ' active' : ''}`}
                  onClick={() => setInternal(true)}
                >
                  Internal note
                </button>
              </div>
            )}
            <form onSubmit={sendMessage}>
              <div className="compose-body">
                <textarea
                  rows={4}
                  placeholder={internal ? 'Add an internal note (hidden from customer)…' : 'Write a reply…'}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  style={{ background: internal ? '#fffbeb' : undefined }}
                />
              </div>
              <div className="compose-footer">
                <button className="btn btn-primary btn-sm" disabled={sending || !body.trim()}>
                  {sending && <span className="spinner" style={{ width: 12, height: 12 }} />}
                  {internal ? 'Add note' : 'Send reply'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar — metadata */}
        <div className="ticket-sidebar-sticky">
          {/* Details card */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">
              <span className="card-title">Details</span>
            </div>

            <div className="meta-section">
              <div className="meta-label">Customer</div>
              <div className="meta-value">
                {t.createdBy?.fullName ? (
                  <div className="user-cell">
                    <Avatar name={t.createdBy.fullName} size="md" />
                    {t.createdBy.fullName}
                  </div>
                ) : '—'}
              </div>
            </div>

            <div className="meta-section">
              <div className="meta-label">Assignee</div>
              <div className="meta-value">
                {t.assignedTo?.fullName ? (
                  <div className="user-cell">
                    <Avatar name={t.assignedTo.fullName} size="md" />
                    {t.assignedTo.fullName}
                  </div>
                ) : (
                  <span className="muted">Unassigned</span>
                )}
              </div>
            </div>

            {isStaff && (
              <div className="meta-section">
                <div className="meta-label">Assign to</div>
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && assign(e.target.value)}
                >
                  <option value="">— select agent —</option>
                  {agents?.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.fullName}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="meta-section">
              <div className="meta-label">Status</div>
              <div className="meta-value">
                <span className={`badge ${t.status}`}>{STATUS_LABELS[t.status] ?? t.status}</span>
              </div>
            </div>

            <div className="meta-section">
              <div className="meta-label">Priority</div>
              <div className="meta-value">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`priority-dot ${t.priority}`} />
                  <span className={`badge ${t.priority}`}>{PRIORITY_LABELS[t.priority] ?? t.priority}</span>
                </div>
              </div>
            </div>

            {t.category && (
              <div className="meta-section">
                <div className="meta-label">Category</div>
                <div className="meta-value">{t.category.name}</div>
              </div>
            )}

            <div className="meta-section">
              <div className="meta-label">Created</div>
              <div className="meta-value muted">{formatDate(t.createdAt)}</div>
            </div>

            {isStaff && !!t.allowedTransitions?.length && (
              <>
                <div className="divider" />
                <div className="meta-label" style={{ marginBottom: 8 }}>Change status</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {t.allowedTransitions.map((s: string) => (
                    <button
                      key={s}
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => changeStatus(s)}
                    >
                      {STATUS_LABELS[s] ?? s}
                    </button>
                  ))}
                </div>
              </>
            )}

            {!isStaff && t.status === 'RESOLVED' && (
              <>
                <div className="divider" />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => changeStatus('REOPENED')}>
                  Reopen ticket
                </button>
              </>
            )}
          </div>

          {/* Activity card */}
          {t.events?.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Activity</span>
              </div>
              <div className="timeline">
                {t.events.map((ev: any) => (
                  <div className="timeline-item" key={ev.id}>
                    <div className="timeline-event">{ev.type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())}</div>
                    {ev.fromValue && (
                      <div className="timeline-change">
                        {STATUS_LABELS[ev.fromValue] ?? ev.fromValue}
                        {' → '}
                        {STATUS_LABELS[ev.toValue] ?? ev.toValue}
                      </div>
                    )}
                    <div className="timeline-meta">
                      {ev.actor?.fullName ?? 'System'}
                      {' · '}{relativeTime(ev.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
