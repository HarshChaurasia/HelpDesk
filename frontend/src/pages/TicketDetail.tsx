import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import { api } from '../api';
import { useAuth } from '../auth';
import { STATUS_LABELS, PRIORITY_LABELS, avatarInitials, avatarStyle, relativeTime, formatDate } from '../utils';
import RichTextEditor from '../components/RichTextEditor';
import UserCombobox, { UserOption } from '../components/UserCombobox';
import AttachmentPanel from '../components/AttachmentPanel';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const EMOJI_PICKER = ['👍', '👎', '❤️', '😂', '🎉', '🤔', '👀', '🙏'];

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <div className={`avatar${size === 'md' ? '' : ' avatar-sm'}`} style={avatarStyle(name)} title={name}>
      {avatarInitials(name)}
    </div>
  );
}

function safeHtml(html: string) {
  // If it's plain text (no tags), render as-is with pre-wrap
  if (!html.includes('<')) return { __html: html.replace(/\n/g, '<br/>') };
  return { __html: DOMPurify.sanitize(html) };
}

function ReactionBar({ message, ticketId, currentUserId, onRefresh }: {
  message: any; ticketId: string; currentUserId: string; onRefresh: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Group reactions by emoji
  const groups: Record<string, { count: number; users: string[]; mine: boolean }> = {};
  for (const r of (message.reactions ?? [])) {
    if (!groups[r.emoji]) groups[r.emoji] = { count: 0, users: [], mine: false };
    groups[r.emoji].count++;
    groups[r.emoji].users.push(r.user?.fullName ?? 'Someone');
    if (r.userId === currentUserId) groups[r.emoji].mine = true;
  }

  async function toggle(emoji: string) {
    await api.post(`/tickets/${ticketId}/messages/${message.id}/reactions`, { emoji });
    onRefresh();
    setShowPicker(false);
  }

  return (
    <div className="reaction-bar">
      {Object.entries(groups).map(([emoji, g]) => (
        <button
          key={emoji}
          type="button"
          className={`reaction-chip${g.mine ? ' mine' : ''}`}
          title={g.users.join(', ')}
          onClick={() => toggle(emoji)}
        >
          {emoji} <span>{g.count}</span>
        </button>
      ))}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          className="btn btn-ghost btn-xs reaction-add-btn"
          title="Add reaction"
          onClick={() => setShowPicker((p) => !p)}
        >😊+</button>
        {showPicker && (
          <div ref={pickerRef} className="emoji-picker">
            {EMOJI_PICKER.map((e) => (
              <button key={e} type="button" className="emoji-pick-btn" onClick={() => toggle(e)}>{e}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  // Edit message
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  // Priority/category editing
  const [editPriority, setEditPriority] = useState(false);
  const [editCategory, setEditCategory] = useState(false);

  const { data: t, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => (await api.get(`/tickets/${id}`)).data,
  });

  const { data: agents = [] } = useQuery<UserOption[]>({
    queryKey: ['agents'],
    queryFn: async () => (await api.get('/users/agents')).data,
    enabled: user?.role !== 'CUSTOMER',
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
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

  // Current assignees from join table; fall back to legacy assignedTo
  const currentAssignees: UserOption[] = t.assignees?.length
    ? t.assignees.map((a: any) => a.user)
    : (t.assignedTo ? [t.assignedTo] : []);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || body === '<p></p>') return;
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

  async function handleAssign(selected: UserOption[]) {
    await api.post(`/tickets/${id}/assign`, { userIds: selected.map((u) => u.id) });
    refresh();
  }

  async function updatePriority(priority: string) {
    await api.patch(`/tickets/${id}`, { priority });
    setEditPriority(false);
    refresh();
  }

  async function updateCategory(categoryId: string) {
    await api.patch(`/tickets/${id}`, { categoryId: categoryId || null });
    setEditCategory(false);
    refresh();
  }

  async function startEdit(m: any) {
    setEditingId(m.id);
    setEditBody(m.body);
  }

  async function saveEdit(msgId: string) {
    await api.patch(`/tickets/${id}/messages/${msgId}`, { body: editBody });
    setEditingId(null);
    refresh();
  }

  async function deleteMessage(msgId: string) {
    if (!confirm('Delete this message?')) return;
    await api.delete(`/tickets/${id}/messages/${msgId}`);
    refresh();
  }

  const visibleMessages = t.messages.filter((m: any) => !m.deletedAt);

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

      {/* 3-column layout: conversation | details | activity */}
      <div className="ticket-layout-3col">

        {/* ── Left: Conversation ── */}
        <div className="ticket-main">
          {/* Messages */}
          <div className="message-list">
            {visibleMessages.map((m: any) => {
              const isOwn = m.author?.id === user?.id;
              return (
                <div key={m.id} className={`message ${m.type}`}>
                  <div className="message-header">
                    <div className="message-author-row">
                      <Avatar name={m.author?.fullName ?? 'System'} />
                      <span className="message-name">{m.author?.fullName ?? 'System'}</span>
                      <span className="message-time" title={formatDate(m.createdAt)}>
                        {relativeTime(m.createdAt)}
                        {m.editedAt && <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>(edited)</span>}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {m.type === 'INTERNAL_NOTE' && (
                        <span className="message-tag">Internal note</span>
                      )}
                      {/* Edit/Delete — own messages or staff */}
                      {(isOwn || isStaff) && editingId !== m.id && (
                        <div className="message-actions">
                          {isOwn && (
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => startEdit(m)} title="Edit">✏️</button>
                          )}
                          {(isOwn || isStaff) && (
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => deleteMessage(m.id)} title="Delete" style={{ color: '#dc2626' }}>🗑</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Body or edit field */}
                  {editingId === m.id ? (
                    <div className="message-edit">
                      <RichTextEditor
                        value={editBody}
                        onChange={setEditBody}
                        mentionUsers={agents}
                        minHeight={80}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button type="button" className="btn btn-primary btn-xs" onClick={() => saveEdit(m.id)}>Save</button>
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="message-body rte-render" dangerouslySetInnerHTML={safeHtml(m.body)} />
                  )}

                  {/* Reactions */}
                  {editingId !== m.id && (
                    <ReactionBar
                      message={m}
                      ticketId={id!}
                      currentUserId={user?.id ?? ''}
                      onRefresh={refresh}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Compose */}
          <div className="compose-box" style={{ marginTop: 16 }}>
            {isStaff && (
              <div className="compose-tabs">
                <button type="button" className={`compose-tab${!internal ? ' active' : ''}`} onClick={() => setInternal(false)}>Reply</button>
                <button type="button" className={`compose-tab${internal ? ' active' : ''}`} onClick={() => setInternal(true)}>Internal note</button>
              </div>
            )}
            <form onSubmit={sendMessage}>
              <div className="compose-body" style={{ background: internal ? '#fffbeb' : undefined }}>
                <RichTextEditor
                  value={body}
                  onChange={setBody}
                  placeholder={internal ? 'Add an internal note (hidden from customer)…' : 'Write a reply…'}
                  mentionUsers={agents}
                  minHeight={100}
                />
              </div>
              <div className="compose-footer">
                <button
                  className="btn btn-primary btn-sm"
                  type="submit"
                  disabled={sending || !body.trim() || body === '<p></p>'}
                >
                  {sending && <span className="spinner" style={{ width: 12, height: 12 }} />}
                  {internal ? 'Add note' : 'Send reply'}
                </button>
              </div>
            </form>
          </div>

          {/* Attachments */}
          <div className="card" style={{ marginTop: 16 }}>
            <AttachmentPanel
              ticketId={id!}
              attachments={t.attachments ?? []}
              onRefresh={refresh}
              canDelete={isStaff}
            />
          </div>
        </div>

        {/* ── Middle: Details ── */}
        <div className="ticket-details-col">
          <div className="card" style={{ position: 'sticky', top: 68 }}>
            <div className="card-header">
              <span className="card-title">Details</span>
            </div>

            {/* Customer */}
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

            {/* Assignees */}
            <div className="meta-section">
              <div className="meta-label">Assignees</div>
              {isStaff ? (
                <UserCombobox
                  users={agents}
                  selected={currentAssignees}
                  onChange={handleAssign}
                  placeholder="Search agents…"
                  multi={true}
                />
              ) : (
                <div className="meta-value">
                  {currentAssignees.length === 0 ? (
                    <span className="muted">Unassigned</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {currentAssignees.map((a) => (
                        <div key={a.id} className="user-cell">
                          <Avatar name={a.fullName} size="md" />
                          {a.fullName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Status */}
            <div className="meta-section">
              <div className="meta-label">Status</div>
              <div className="meta-value">
                <span className={`badge ${t.status}`}>{STATUS_LABELS[t.status] ?? t.status}</span>
              </div>
            </div>

            {/* Priority */}
            <div className="meta-section">
              <div className="meta-label">Priority</div>
              {isStaff && editPriority ? (
                <div>
                  <select
                    defaultValue={t.priority}
                    autoFocus
                    onChange={(e) => updatePriority(e.target.value)}
                    onBlur={() => setEditPriority(false)}
                    style={{ fontSize: 13 }}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{PRIORITY_LABELS[p] ?? p}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div
                  className="meta-value"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isStaff ? 'pointer' : undefined }}
                  onClick={() => isStaff && setEditPriority(true)}
                  title={isStaff ? 'Click to change priority' : undefined}
                >
                  <span className={`priority-dot ${t.priority}`} />
                  <span className={`badge ${t.priority}`}>{PRIORITY_LABELS[t.priority] ?? t.priority}</span>
                  {isStaff && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>✏️</span>}
                </div>
              )}
            </div>

            {/* Category */}
            <div className="meta-section">
              <div className="meta-label">Category</div>
              {isStaff && editCategory ? (
                <select
                  defaultValue={t.categoryId ?? ''}
                  autoFocus
                  onChange={(e) => updateCategory(e.target.value)}
                  onBlur={() => setEditCategory(false)}
                  style={{ fontSize: 13 }}
                >
                  <option value="">— None —</option>
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <div
                  className="meta-value"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: isStaff ? 'pointer' : undefined }}
                  onClick={() => isStaff && setEditCategory(true)}
                  title={isStaff ? 'Click to change category' : undefined}
                >
                  <span>{t.category?.name ?? <span className="muted">None</span>}</span>
                  {isStaff && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>✏️</span>}
                </div>
              )}
            </div>

            {/* Created */}
            <div className="meta-section">
              <div className="meta-label">Created</div>
              <div className="meta-value muted">{formatDate(t.createdAt)}</div>
            </div>

            {/* Status transitions */}
            {isStaff && !!t.allowedTransitions?.length && (
              <>
                <div className="divider" />
                <div className="meta-label" style={{ marginBottom: 8 }}>Change status</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {t.allowedTransitions.map((s: string) => (
                    <button key={s} type="button" className="btn btn-secondary btn-xs" onClick={() => changeStatus(s)}>
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
        </div>

        {/* ── Right: Activity ── */}
        {t.events?.length > 0 && (
          <div className="ticket-activity-col">
            <div className="card" style={{ position: 'sticky', top: 68 }}>
              <div className="card-header">
                <span className="card-title">Activity</span>
              </div>
              <div className="timeline">
                {t.events.map((ev: any) => (
                  <div className="timeline-item" key={ev.id}>
                    <div className="timeline-event">
                      {ev.type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())}
                    </div>
                    {ev.fromValue && (
                      <div className="timeline-change">
                        {STATUS_LABELS[ev.fromValue] ?? PRIORITY_LABELS[ev.fromValue] ?? ev.fromValue}
                        {' → '}
                        {STATUS_LABELS[ev.toValue] ?? PRIORITY_LABELS[ev.toValue] ?? ev.toValue}
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
          </div>
        )}
      </div>
    </div>
  );
}
