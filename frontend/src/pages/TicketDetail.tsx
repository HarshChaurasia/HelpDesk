import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { api } from '../api';
import { useAuth } from '../auth';
import { STATUS_LABELS, PRIORITY_LABELS, avatarInitials, avatarStyle, relativeTime, formatDate } from '../utils';
import RichTextEditor from '../components/RichTextEditor';
import UserCombobox, { UserOption } from '../components/UserCombobox';
import AttachmentPanel from '../components/AttachmentPanel';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const EMOJI_PICKER = ['👍', '👎', '❤️', '😂', '🎉', '🤔', '👀', '🙏'];
const TIME_LOG_TYPES = ['INVESTIGATION', 'DEVELOPMENT', 'TESTING', 'OTHER'] as const;

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <div className={`avatar${size === 'md' ? '' : ' avatar-sm'}`} style={avatarStyle(name)} title={name}>
      {avatarInitials(name)}
    </div>
  );
}

function safeHtml(html: string) {
  if (!html?.includes('<')) return { __html: (html ?? '').replace(/\n/g, '<br/>') };
  return { __html: DOMPurify.sanitize(html) };
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="meta-section">
      <div className="meta-label">{label}</div>
      <div className="meta-value">{children}</div>
    </div>
  );
}

function ReactionBar({ message, ticketId, currentUserId, onRefresh }: {
  message: any; ticketId: string; currentUserId: string; onRefresh: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
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
        <button key={emoji} type="button" className={`reaction-chip${g.mine ? ' mine' : ''}`} title={g.users.join(', ')} onClick={() => toggle(emoji)}>
          {emoji} <span>{g.count}</span>
        </button>
      ))}
      <div style={{ position: 'relative' }}>
        <button type="button" className="btn btn-ghost btn-xs reaction-add-btn" onClick={() => setShowPicker((p) => !p)}>😊+</button>
        {showPicker && (
          <div className="emoji-picker">
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

  // Compose
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  // Edit message
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  // Draft changes (save button pattern)
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const hasDraft = Object.keys(draft).length > 0;

  function patchDraft(key: string, value: any) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // Time log form
  const [showTimeLog, setShowTimeLog] = useState(false);
  const [timeType, setTimeType] = useState<typeof TIME_LOG_TYPES[number]>('INVESTIGATION');
  const [timeHours, setTimeHours] = useState('');
  const [timeBillable, setTimeBillable] = useState(true);
  const [timeNote, setTimeNote] = useState('');

  // Resolution/RCA panel
  const [showResolution, setShowResolution] = useState(false);

  // Tag input
  const [tagInput, setTagInput] = useState('');

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

  const { data: allTags = [] } = useQuery<any[]>({
    queryKey: ['tags'],
    queryFn: async () => (await api.get('/tags')).data,
    enabled: user?.role !== 'CUSTOMER',
  });

  // Reset draft when ticket reloads
  useEffect(() => { if (t) setDraft({}); }, [t?.id]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['ticket', id] });
  const isStaff = user?.role !== 'CUSTOMER';

  if (isLoading || !t) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)', padding: 32 }}><span className="spinner" /> Loading ticket…</div>;
  }

  const currentAssignees: UserOption[] = t.assignees?.length
    ? t.assignees.map((a: any) => a.user)
    : (t.assignedTo ? [t.assignedTo] : []);

  const selectedCategoryId = 'categoryId' in draft ? draft.categoryId : t.categoryId;
  const selectedCategory = categories.find((c: any) => c.id === selectedCategoryId);
  const subcategories: any[] = selectedCategory?.subcategories ?? [];

  const ticketTags: string[] = t.tags?.map((tt: any) => tt.tagId) ?? [];

  // Time log totals
  const timeByType: Record<string, number> = {};
  let billableHours = 0, nonBillableHours = 0;
  for (const log of (t.timeLogs ?? [])) {
    timeByType[log.type] = (timeByType[log.type] ?? 0) + log.hours;
    if (log.billable !== false) billableHours += log.hours;
    else nonBillableHours += log.hours;
  }
  const totalHours = Object.values(timeByType).reduce((s: number, v: any) => s + (v as number), 0);

  async function saveChanges() {
    if (!hasDraft) return;
    setSaving(true);
    try {
      await api.patch(`/tickets/${id}`, draft);
      setDraft({});
      refresh();
    } finally { setSaving(false); }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || body === '<p></p>') return;
    setSending(true);
    try {
      await api.post(`/tickets/${id}/messages`, { body, type: internal ? 'INTERNAL_NOTE' : 'PUBLIC_REPLY' });
      setBody('');
      refresh();
    } finally { setSending(false); }
  }

  async function changeStatus(status: string) {
    await api.post(`/tickets/${id}/status`, { status });
    refresh();
  }

  async function handleAssign(selected: UserOption[]) {
    await api.post(`/tickets/${id}/assign`, { userIds: selected.map((u) => u.id) });
    refresh();
  }

  async function startEdit(m: any) { setEditingId(m.id); setEditBody(m.body); }
  async function saveEdit(msgId: string) {
    await api.patch(`/tickets/${id}/messages/${msgId}`, { body: editBody });
    setEditingId(null); refresh();
  }
  async function deleteMessage(msgId: string) {
    if (!confirm('Delete this message?')) return;
    await api.delete(`/tickets/${id}/messages/${msgId}`);
    refresh();
  }

  async function toggleTag(tagId: string) {
    await api.post(`/tickets/${id}/tags`, { tagId });
    refresh();
  }

  async function createAndAddTag() {
    if (!tagInput.trim()) return;
    const { data: tag } = await api.post('/tags', { name: tagInput.trim() });
    await api.post(`/tickets/${id}/tags`, { tagId: tag.id });
    setTagInput('');
    qc.invalidateQueries({ queryKey: ['tags'] });
    refresh();
  }

  async function addTimeLog() {
    if (!timeHours || parseFloat(timeHours) <= 0) return;
    await api.post(`/tickets/${id}/timelogs`, { type: timeType, hours: parseFloat(timeHours), billable: timeBillable, note: timeNote });
    setTimeHours(''); setTimeNote(''); setTimeBillable(true); setShowTimeLog(false);
    refresh();
  }

  async function assignToMe() {
    await api.post(`/tickets/${id}/assign`, { userIds: [user!.id] });
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

      {/* Header */}
      <div className="ticket-header">
        <div className="ticket-header-row">
          <span className={`badge ${t.status}`}>{STATUS_LABELS[t.status] ?? t.status}</span>
          <span className={`badge ${t.priority}`}>{PRIORITY_LABELS[t.priority] ?? t.priority}</span>
          {t.slaBreached && <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>SLA Breached</span>}
          {t.noAutoClose && <span className="badge" style={{ background: '#f3f4f6', color: '#6b7280' }}>No Auto-Close</span>}
        </div>
        <div className="ticket-subject">{t.subject}</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
          Ticket #{t.reference} · Opened by <strong>{t.createdBy?.fullName ?? 'Unknown'}</strong> · {formatDate(t.createdAt)}
        </div>

        {/* Quick action buttons */}
        {isStaff && (
          <div className="quick-actions">
            {!currentAssignees.some((a) => a.id === user?.id) && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={assignToMe}>👤 Assign to Me</button>
            )}
            {t.allowedTransitions?.includes('RESOLVED') && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => setShowResolution(true)}>✓ Resolve</button>
            )}
            {t.allowedTransitions?.includes('CLOSED') && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => changeStatus('CLOSED')}>🔒 Close</button>
            )}
            {t.allowedTransitions?.includes('REOPENED') && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => changeStatus('REOPENED')}>↩ Reopen</button>
            )}
            {t.allowedTransitions?.includes('IN_PROGRESS') && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => changeStatus('IN_PROGRESS')}>▶ Start</button>
            )}
          </div>
        )}
        {!isStaff && t.status === 'RESOLVED' && (
          <div className="quick-actions">
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => changeStatus('REOPENED')}>↩ Reopen ticket</button>
          </div>
        )}
      </div>

      {/* Resolution/RCA modal overlay */}
      {showResolution && (
        <div className="preview-overlay" onClick={() => setShowResolution(false)}>
          <div className="preview-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <span style={{ fontSize: 14, fontWeight: 600 }}>Resolve Ticket</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowResolution(false)}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Resolution Summary <span style={{ color: '#ef4444' }}>*</span></label>
                <textarea rows={3} placeholder="Describe what was done to resolve this ticket…"
                  value={draft.resolutionSummary ?? t.resolutionSummary ?? ''}
                  onChange={(e) => patchDraft('resolutionSummary', e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Root Cause</label>
                <textarea rows={2} placeholder="What caused this issue?"
                  value={draft.rootCause ?? t.rootCause ?? ''}
                  onChange={(e) => patchDraft('rootCause', e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Corrective Action</label>
                <textarea rows={2} placeholder="Immediate fix applied…"
                  value={draft.correctiveAction ?? t.correctiveAction ?? ''}
                  onChange={(e) => patchDraft('correctiveAction', e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Preventive Action</label>
                <textarea rows={2} placeholder="How to prevent recurrence…"
                  value={draft.preventiveAction ?? t.preventiveAction ?? ''}
                  onChange={(e) => patchDraft('preventiveAction', e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowResolution(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={async () => {
                  if (hasDraft) await saveChanges();
                  await changeStatus('RESOLVED');
                  setShowResolution(false);
                }}>
                  Save & Resolve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3-column layout */}
      <div className="ticket-layout-3col">

        {/* ── Left: Conversation ── */}
        <div className="ticket-main">
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
                      {m.type === 'INTERNAL_NOTE' && <span className="message-tag">Internal note</span>}
                      {(isOwn || isStaff) && editingId !== m.id && (
                        <div className="message-actions">
                          {isOwn && <button type="button" className="btn btn-ghost btn-xs" onClick={() => startEdit(m)} title="Edit">✏️</button>}
                          {(isOwn || isStaff) && <button type="button" className="btn btn-ghost btn-xs" onClick={() => deleteMessage(m.id)} title="Delete" style={{ color: '#dc2626' }}>🗑</button>}
                        </div>
                      )}
                    </div>
                  </div>
                  {editingId === m.id ? (
                    <div className="message-edit">
                      <RichTextEditor value={editBody} onChange={setEditBody} mentionUsers={agents} minHeight={80} />
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button type="button" className="btn btn-primary btn-xs" onClick={() => saveEdit(m.id)}>Save</button>
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="message-body rte-render" dangerouslySetInnerHTML={safeHtml(m.body)} />
                  )}
                  {editingId !== m.id && (
                    <ReactionBar message={m} ticketId={id!} currentUserId={user?.id ?? ''} onRefresh={refresh} />
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
                <button className="btn btn-primary btn-sm" type="submit" disabled={sending || !body.trim() || body === '<p></p>'}>
                  {sending && <span className="spinner" style={{ width: 12, height: 12 }} />}
                  {internal ? 'Add note' : 'Send reply'}
                </button>
              </div>
            </form>
          </div>

          {/* Attachments */}
          <div className="card" style={{ marginTop: 16 }}>
            <AttachmentPanel ticketId={id!} attachments={t.attachments ?? []} onRefresh={refresh} canDelete={isStaff} />
          </div>

          {/* Time Tracking */}
          {isStaff && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <span className="card-title">Time Tracking</span>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => setShowTimeLog((v) => !v)}>+ Log time</button>
              </div>
              {showTimeLog && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Type</label>
                    <select value={timeType} onChange={(e) => setTimeType(e.target.value as any)}>
                      {TIME_LOG_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Hours</label>
                    <input type="number" min="0.1" step="0.5" placeholder="e.g. 2.5" value={timeHours} onChange={(e) => setTimeHours(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Billable</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 4 }}>
                      <input type="checkbox" style={{ width: 'auto' }} checked={timeBillable} onChange={(e) => setTimeBillable(e.target.checked)} />
                      Billable hours
                    </label>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                    <label className="form-label">Note (optional)</label>
                    <input type="text" placeholder="What did you work on?" value={timeNote} onChange={(e) => setTimeNote(e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-xs" type="button" onClick={addTimeLog}>Log</button>
                    <button className="btn btn-ghost btn-xs" type="button" onClick={() => setShowTimeLog(false)}>Cancel</button>
                  </div>
                </div>
              )}
              {totalHours > 0 ? (
                <div className="timelog-summary">
                  {TIME_LOG_TYPES.map((type) => timeByType[type] ? (
                    <div key={type} className="timelog-row">
                      <span className="timelog-type">{type.charAt(0) + type.slice(1).toLowerCase()}</span>
                      <span className="timelog-hours">{timeByType[type]}h</span>
                    </div>
                  ) : null)}
                  <div className="timelog-row timelog-total">
                    <span>Total</span>
                    <span>{totalHours}h</span>
                  </div>
                  {(billableHours > 0 || nonBillableHours > 0) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 11.5, color: 'var(--text-3)' }}>
                      <span>Billable: <strong style={{ color: 'var(--text)' }}>{billableHours}h</strong></span>
                      {nonBillableHours > 0 && <span>Non-billable: <strong style={{ color: 'var(--text)' }}>{nonBillableHours}h</strong></span>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>No time logged yet.</div>
              )}
            </div>
          )}
        </div>

        {/* ── Middle: Details ── */}
        <div className="ticket-details-col">
          <div className="card" style={{ position: 'sticky', top: 68 }}>
            <div className="card-header">
              <span className="card-title">Details</span>
              {isStaff && hasDraft && (
                <button className="btn btn-primary btn-xs" onClick={saveChanges} disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              )}
            </div>

            {/* Customer */}
            <MetaRow label="Customer">
              {t.createdBy?.fullName ? (
                <div>
                  <div className="user-cell" style={{ marginBottom: 3 }}>
                    <Avatar name={t.createdBy.fullName} size="md" />
                    <span style={{ fontWeight: 500 }}>{t.createdBy.fullName}</span>
                  </div>
                  {t.createdBy.email && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t.createdBy.email}</div>}
                  {t.createdBy.phone && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>📞 {t.createdBy.phone}</div>}
                  {t.createdBy.organization && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>🏢 {t.createdBy.organization}</div>}
                </div>
              ) : '—'}
            </MetaRow>

            {/* Assignees */}
            <MetaRow label="Assignees">
              {isStaff ? (
                <UserCombobox users={agents} selected={currentAssignees} onChange={handleAssign} placeholder="Search agents…" multi />
              ) : (
                currentAssignees.length === 0
                  ? <span className="muted">Unassigned</span>
                  : currentAssignees.map((a) => (
                    <div key={a.id} className="user-cell" style={{ marginBottom: 3 }}>
                      <Avatar name={a.fullName} size="md" />{a.fullName}
                    </div>
                  ))
              )}
            </MetaRow>

            {/* Priority */}
            <MetaRow label="Priority">
              {isStaff ? (
                <select
                  value={draft.priority ?? t.priority}
                  onChange={(e) => patchDraft('priority', e.target.value)}
                  style={{ fontSize: 13 }}
                >
                  {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              ) : (
                <span className={`badge ${t.priority}`}>{PRIORITY_LABELS[t.priority] ?? t.priority}</span>
              )}
            </MetaRow>

            {/* Category */}
            <MetaRow label="Category">
              {isStaff ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <select
                    value={draft.categoryId ?? t.categoryId ?? ''}
                    onChange={(e) => {
                      patchDraft('categoryId', e.target.value || null);
                      patchDraft('subcategoryId', null);
                    }}
                    style={{ fontSize: 13 }}
                  >
                    <option value="">— None —</option>
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {subcategories.length > 0 && (
                    <select
                      value={draft.subcategoryId ?? t.subcategoryId ?? ''}
                      onChange={(e) => patchDraft('subcategoryId', e.target.value || null)}
                      style={{ fontSize: 13 }}
                    >
                      <option value="">— Subcategory —</option>
                      {subcategories.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                </div>
              ) : (
                <span>
                  {t.category?.name ?? <span className="muted">None</span>}
                  {t.subcategory && <span className="muted"> / {t.subcategory.name}</span>}
                </span>
              )}
            </MetaRow>

            {/* Delivery Date */}
            <MetaRow label="Delivery Date">
              {isStaff ? (
                <input
                  type="datetime-local"
                  value={draft.deliveryDate ? new Date(draft.deliveryDate).toISOString().slice(0, 16) : (t.deliveryDate ? new Date(t.deliveryDate).toISOString().slice(0, 16) : '')}
                  onChange={(e) => patchDraft('deliveryDate', e.target.value || null)}
                  style={{ fontSize: 13 }}
                />
              ) : (
                t.deliveryDate ? formatDate(t.deliveryDate) : <span className="muted">Not set</span>
              )}
            </MetaRow>

            {/* Tags */}
            {isStaff && (
              <MetaRow label="Tags">
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {t.tags?.map((tt: any) => (
                      <button key={tt.tagId} type="button" className="tag-chip tag-chip-removable"
                        style={{ background: tt.tag.color + '22', color: tt.tag.color, borderColor: tt.tag.color + '44' }}
                        onClick={() => toggleTag(tt.tagId)}
                        title="Click to remove"
                      >
                        {tt.tag.name} ×
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type="text"
                      placeholder="Add tag…"
                      value={tagInput}
                      list="tag-suggestions"
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createAndAddTag(); } }}
                      style={{ fontSize: 12, padding: '4px 8px', flex: 1 }}
                    />
                    <datalist id="tag-suggestions">
                      {allTags.filter((tg: any) => !ticketTags.includes(tg.id)).map((tg: any) => (
                        <option key={tg.id} value={tg.name} />
                      ))}
                    </datalist>
                    <button type="button" className="btn btn-secondary btn-xs" onClick={createAndAddTag}>Add</button>
                  </div>
                </div>
              </MetaRow>
            )}

            {/* No auto-close */}
            {isStaff && (
              <MetaRow label="Auto-close">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={draft.noAutoClose ?? t.noAutoClose}
                    onChange={(e) => patchDraft('noAutoClose', e.target.checked)}
                  />
                  Disable auto-close
                </label>
              </MetaRow>
            )}

            {/* SLA */}
            {(t.slaResponseDueAt || t.slaResolutionDueAt) && (
              <>
                <div className="divider" />
                <div className="meta-label" style={{ marginBottom: 6 }}>SLA</div>
                {t.slaResponseDueAt && (
                  <div style={{ fontSize: 12, marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Response due</span>
                    <span style={{ color: new Date(t.slaResponseDueAt) < new Date() ? '#dc2626' : 'var(--text)' }}>
                      {relativeTime(t.slaResponseDueAt)}
                    </span>
                  </div>
                )}
                {t.slaResolutionDueAt && (
                  <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Resolution due</span>
                    <span style={{ color: new Date(t.slaResolutionDueAt) < new Date() ? '#dc2626' : 'var(--text)' }}>
                      {relativeTime(t.slaResolutionDueAt)}
                    </span>
                  </div>
                )}
              </>
            )}

            <div className="divider" />
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Created {formatDate(t.createdAt)}</div>

            {/* Save button bottom */}
            {isStaff && hasDraft && (
              <button className="btn btn-primary btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={saveChanges} disabled={saving}>
                {saving ? 'Saving…' : '💾 Save changes'}
              </button>
            )}
          </div>

          {/* System Info */}
          {isStaff && (
            <div className="card" style={{ marginTop: 12, position: 'sticky', top: 68 }}>
              <div className="card-header">
                <span className="card-title">System Info</span>
              </div>
              {(['systemProduct', 'systemModule', 'systemVersion', 'systemBrowser', 'systemOs'] as const).map((field) => {
                const labels: Record<string, string> = { systemProduct: 'Product', systemModule: 'Module', systemVersion: 'Version', systemBrowser: 'Browser', systemOs: 'OS' };
                return (
                  <div key={field} className="meta-section">
                    <div className="meta-label">{labels[field]}</div>
                    {isStaff ? (
                      <input
                        type="text"
                        placeholder={`Enter ${labels[field].toLowerCase()}…`}
                        value={draft[field] ?? t[field] ?? ''}
                        onChange={(e) => patchDraft(field, e.target.value)}
                        style={{ fontSize: 12.5, padding: '4px 8px' }}
                      />
                    ) : (
                      <div className="meta-value">{t[field] ?? <span className="muted">—</span>}</div>
                    )}
                  </div>
                );
              })}
              {isStaff && hasDraft && (
                <button className="btn btn-primary btn-xs" style={{ marginTop: 8, width: '100%' }} onClick={saveChanges} disabled={saving}>
                  Save changes
                </button>
              )}
            </div>
          )}

          {/* Resolution / RCA */}
          {(t.resolutionSummary || t.rootCause) && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-header"><span className="card-title">Resolution</span></div>
              {t.resolutionSummary && <MetaRow label="Summary"><div style={{ fontSize: 13 }}>{t.resolutionSummary}</div></MetaRow>}
              {t.rootCause && <MetaRow label="Root Cause"><div style={{ fontSize: 13 }}>{t.rootCause}</div></MetaRow>}
              {t.correctiveAction && <MetaRow label="Corrective Action"><div style={{ fontSize: 13 }}>{t.correctiveAction}</div></MetaRow>}
              {t.preventiveAction && <MetaRow label="Preventive Action"><div style={{ fontSize: 13 }}>{t.preventiveAction}</div></MetaRow>}
            </div>
          )}
        </div>

        {/* ── Right: Activity ── */}
        {t.events?.length > 0 && (
          <div className="ticket-activity-col">
            <div className="card" style={{ position: 'sticky', top: 68 }}>
              <div className="card-header"><span className="card-title">Activity</span></div>
              <div className="timeline">
                {t.events.map((ev: any) => (
                  <div className="timeline-item" key={ev.id}>
                    <div className="timeline-event">
                      {ev.type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())}
                    </div>
                    {(ev.fromValue || ev.toValue) && (
                      <div className="timeline-change">
                        {ev.fromValue && <>{STATUS_LABELS[ev.fromValue] ?? PRIORITY_LABELS[ev.fromValue] ?? ev.fromValue} → </>}
                        {STATUS_LABELS[ev.toValue] ?? PRIORITY_LABELS[ev.toValue] ?? ev.toValue}
                      </div>
                    )}
                    <div className="timeline-meta">{ev.actor?.fullName ?? 'System'} · {relativeTime(ev.createdAt)}</div>
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
