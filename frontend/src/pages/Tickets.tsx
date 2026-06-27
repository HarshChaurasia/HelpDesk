import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useUi } from '../ui';
import { STATUS_LABELS, PRIORITY_LABELS, PRIORITY_SHORT, avatarInitials, avatarStyle, relativeTime } from '../utils';

const STATUS_OPTIONS = ['NEW', 'OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED', 'REOPENED'];
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function ticketAgeDays(createdAt: string) {
  return (Date.now() - new Date(createdAt).getTime()) / 86400000;
}

function AgeBadge({ createdAt }: { createdAt: string }) {
  const days = ticketAgeDays(createdAt);
  const label = days < 1 ? `${Math.round(days * 24)}h` : `${Math.floor(days)}d`;
  const cls = days < 1 ? 'age-green' : days < 3 ? 'age-yellow' : days < 7 ? 'age-orange' : 'age-red';
  return <span className={`age-badge ${cls}`}>{label}</span>;
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="avatar avatar-sm" style={avatarStyle(name)} title={name}>
      {avatarInitials(name)}
    </div>
  );
}

const CLOSED_STATUSES = new Set(['RESOLVED', 'CLOSED']);

function SlaStatusBadge({ ticket }: { ticket: any }) {
  if (CLOSED_STATUSES.has(ticket.status)) return null;
  if (ticket.slaBreached) {
    return <span className="sla-badge sla-breached">Breached</span>;
  }
  const due = ticket.slaResolutionDueAt ? new Date(ticket.slaResolutionDueAt).getTime() : null;
  if (due && due - Date.now() < 2 * 60 * 60 * 1000) {
    return <span className="sla-badge sla-at-risk">At Risk</span>;
  }
  if (ticket.slaResolutionDueAt) {
    return <span className="sla-badge sla-ok">On Track</span>;
  }
  return null;
}

type SortField = 'reference' | 'subject' | 'createdAt' | 'updatedAt' | 'priority' | 'status' | 'category';

export default function Tickets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast, confirm } = useUi();

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [scope, setScope] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Sort
  const [sort, setSort] = useState<SortField>('createdAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  // Table density (persisted)
  const [density, setDensity] = useState<'comfortable' | 'compact'>(
    () => (localStorage.getItem('hd_density') as 'comfortable' | 'compact') ?? 'comfortable',
  );
  function toggleDensity() {
    setDensity((d) => {
      const next = d === 'comfortable' ? 'compact' : 'comfortable';
      localStorage.setItem('hd_density', next);
      return next;
    });
  }

  // Bulk select
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');

  // Saved views
  const [saveViewName, setSaveViewName] = useState('');
  const [showSaveView, setShowSaveView] = useState(false);

  // Poll
  const [polling, setPolling] = useState(false);
  const [pollMsg, setPollMsg] = useState<string | null>(null);

  const isStaff = user?.role !== 'CUSTOMER';

  const queryParams = useMemo(() => {
    const p: Record<string, any> = { sort, dir };
    if (search) p.q = search;
    if (statusFilter.length === 1) p.status = statusFilter[0];
    if (priorityFilter.length === 1) p.priority = priorityFilter[0];
    if (categoryId) p.categoryId = categoryId;
    if (scope === 'mine') p.mine = 'true';
    if (scope === 'unassigned') p.unassigned = 'true';
    return p;
  }, [search, statusFilter, priorityFilter, categoryId, scope, sort, dir]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tickets', queryParams],
    queryFn: async () => (await api.get('/tickets', { params: queryParams })).data,
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
    enabled: isStaff,
  });

  const { data: agents = [] } = useQuery<any[]>({
    queryKey: ['agents'],
    queryFn: async () => (await api.get('/users/agents')).data,
    enabled: isStaff,
  });

  const { data: savedViews = [], refetch: refetchViews } = useQuery<any[]>({
    queryKey: ['saved-views'],
    queryFn: async () => (await api.get('/views')).data,
    enabled: isStaff,
  });

  const tickets: any[] = useMemo(() => {
    let t = data?.data ?? [];
    // Client-side multi-value filter (server supports single value only)
    if (statusFilter.length > 1) t = t.filter((x: any) => statusFilter.includes(x.status));
    if (priorityFilter.length > 1) t = t.filter((x: any) => priorityFilter.includes(x.priority));
    return t;
  }, [data, statusFilter, priorityFilter]);

  const total: number = data?.meta?.total ?? 0;

  function toggleSort(field: SortField) {
    if (sort === field) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(field); setDir('desc'); }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sort !== field) return <span style={{ opacity: 0.3, fontSize: 10 }}>↕</span>;
    return <span style={{ fontSize: 10 }}>{dir === 'asc' ? '↑' : '↓'}</span>;
  }

  function toggleAll() {
    if (selected.size === tickets.length) setSelected(new Set());
    else setSelected(new Set(tickets.map((t: any) => t.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function assignTicket(ticketId: string, userId: string) {
    try {
      await api.post(`/tickets/${ticketId}/assign`, { userIds: userId ? [userId] : [] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      toast.success(userId ? 'Assignee updated' : 'Ticket unassigned');
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? 'Failed to update assignee');
    }
  }

  async function quickResolve(id: string) {
    try {
      await api.post(`/tickets/${id}/status`, { status: 'RESOLVED' });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      toast.success('Ticket marked resolved');
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? 'Failed to resolve ticket');
    }
  }

  async function downloadTicketPdf(t: any) {
    try {
      const res = await api.get(`/tickets/${t.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ticket-${t.reference}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download PDF');
    }
  }

  async function runBulk() {
    if (!bulkAction || selected.size === 0) return;
    const ids = Array.from(selected);
    const count = ids.length;
    if (bulkAction === 'delete') {
      const ok = await confirm({
        title: 'Delete tickets',
        message: `Permanently delete ${count} ticket${count === 1 ? '' : 's'}? This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await api.post('/tickets/bulk', { ids, action: bulkAction });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      setSelected(new Set());
      setBulkAction('');
      toast.success(`Updated ${count} ticket${count === 1 ? '' : 's'}`);
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? 'Bulk action failed');
    }
  }

  async function exportCsv() {
    const res = await api.get('/tickets/export', { params: queryParams, responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportXlsx() {
    const res = await api.get('/tickets/export-xlsx', { params: queryParams, responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveView() {
    if (!saveViewName.trim()) return;
    const filters = { search, statusFilter, priorityFilter, categoryId, scope };
    await api.post('/views', { name: saveViewName.trim(), filters });
    setSaveViewName('');
    setShowSaveView(false);
    refetchViews();
  }

  function applyView(v: any) {
    const f = v.filters ?? {};
    setSearch(f.search ?? '');
    setStatusFilter(f.statusFilter ?? []);
    setPriorityFilter(f.priorityFilter ?? []);
    setCategoryId(f.categoryId ?? '');
    setScope(f.scope ?? '');
  }

  async function deleteView(id: string) {
    await api.delete(`/views/${id}`);
    refetchViews();
  }

  async function pollNow() {
    setPolling(true);
    setPollMsg(null);
    try {
      const res = await api.post('/admin/mail/poll-now');
      const { processed } = res.data;
      setPollMsg(processed > 0 ? `✓ ${processed} email${processed === 1 ? '' : 's'} imported` : '✓ No new emails');
      if (processed > 0) qc.invalidateQueries({ queryKey: ['tickets'] });
    } catch { setPollMsg('✗ Poll failed'); }
    finally {
      setPolling(false);
      setTimeout(() => setPollMsg(null), 4000);
    }
  }

  const activeFilterCount = (statusFilter.length > 0 ? 1 : 0) + (priorityFilter.length > 0 ? 1 : 0) + (categoryId ? 1 : 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Tickets</div>
          {!isLoading && <div className="page-subtitle">{total} ticket{total !== 1 ? 's' : ''}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {user?.role === 'ADMIN' && (
            <>
              {pollMsg && <span style={{ fontSize: 13, color: pollMsg.startsWith('✓') ? '#16a34a' : '#b91c1c' }}>{pollMsg}</span>}
              <button className="btn btn-secondary btn-sm" onClick={pollNow} disabled={polling}>
                {polling ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Polling…</> : '↓ Poll inbox'}
              </button>
            </>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={toggleDensity}
            title={density === 'comfortable' ? 'Switch to compact rows' : 'Switch to comfortable rows'}
            aria-label="Toggle table density"
          >{density === 'comfortable' ? '≣ Compact' : '≡ Comfortable'}</button>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>↓ CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={exportXlsx}>↓ XLSX</button>
          <Link to="/tickets/new" className="btn btn-primary btn-sm">+ New Ticket</Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar" style={{ gap: 8, marginBottom: 12 }}>
        {/* Search */}
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search tickets, customers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, padding: '6px 8px 6px 32px', width: 200 }}
          />
          {search && <button className="btn btn-ghost btn-xs" onClick={() => setSearch('')} style={{ padding: '0 4px' }}>✕</button>}
        </div>

        {/* Scope tabs */}
        {isStaff && (
          <div className="tab-group">
            {[{ value: '', label: 'All' }, { value: 'mine', label: 'Mine' }, { value: 'unassigned', label: 'Unassigned' }].map((t) => (
              <button key={t.value} type="button" className={`tab-btn${scope === t.value ? ' active' : ''}`} onClick={() => setScope(t.value)}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Advanced filters toggle */}
        <button
          type="button"
          className={`btn btn-secondary btn-sm${activeFilterCount > 0 ? ' filter-active' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
        </button>

        {activeFilterCount > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { setStatusFilter([]); setPriorityFilter([]); setCategoryId(''); }}
          >
            Clear filters
          </button>
        )}

        {/* Saved Views */}
        {isStaff && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            {savedViews.length > 0 && (
              <select
                style={{ fontSize: 12, padding: '4px 8px' }}
                value=""
                onChange={(e) => {
                  const v = savedViews.find((sv) => sv.id === e.target.value);
                  if (v) applyView(v);
                }}
              >
                <option value="">Saved views…</option>
                {savedViews.map((v: any) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            )}
            {showSaveView ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="text"
                  placeholder="View name…"
                  value={saveViewName}
                  onChange={(e) => setSaveViewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveView(); if (e.key === 'Escape') setShowSaveView(false); }}
                  style={{ fontSize: 12, padding: '4px 8px', width: 130 }}
                  autoFocus
                />
                <button className="btn btn-primary btn-xs" onClick={saveView}>Save</button>
                <button className="btn btn-ghost btn-xs" onClick={() => setShowSaveView(false)}>✕</button>
              </div>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSaveView(true)} style={{ fontSize: 12 }}>
                ☆ Save view
              </button>
            )}
          </div>
        )}
      </div>

      {/* Advanced filters panel */}
      {showFilters && (
        <div className="filters-panel">
          <div className="filters-group">
            <div className="filters-label">Status</div>
            <div className="filters-chips">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`filter-chip${statusFilter.includes(s) ? ' active' : ''}`}
                  onClick={() => setStatusFilter((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                >
                  {STATUS_LABELS[s] ?? s}
                </button>
              ))}
            </div>
          </div>
          <div className="filters-group">
            <div className="filters-label">Priority</div>
            <div className="filters-chips">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`filter-chip priority-chip ${p}${priorityFilter.includes(p) ? ' active' : ''}`}
                  onClick={() => setPriorityFilter((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])}
                >
                  {PRIORITY_LABELS[p] ?? p}
                </button>
              ))}
            </div>
          </div>
          {isStaff && categories.length > 0 && (
            <div className="filters-group">
              <div className="filters-label">Category</div>
              <div className="filters-chips">
                {categories.map((c: any) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`filter-chip${categoryId === c.id ? ' active' : ''}`}
                    onClick={() => setCategoryId((prev) => prev === c.id ? '' : c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span style={{ fontSize: 13, fontWeight: 500 }}>{selected.size} selected</span>
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            style={{ width: 'auto', fontSize: 13 }}
          >
            <option value="">Choose action…</option>
            <option value="resolve">Mark Resolved</option>
            <option value="close">Close</option>
            <option value="priority">Set Priority…</option>
            {user?.role === 'ADMIN' && <option value="delete">Delete</option>}
          </select>
          <button className="btn btn-primary btn-sm" onClick={runBulk} disabled={!bulkAction}>Apply</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Deselect all</button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="table-wrap" style={{ flex: 1, padding: '8px 4px' }} aria-busy="true" aria-label="Loading tickets">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-row" style={{ width: `${90 - (i % 4) * 8}%` }} />
          ))}
        </div>
      ) : isError ? (
        <div className="alert alert-error">
          Failed to load tickets — {(error as any)?.message ?? 'API unreachable'}.{' '}
          <a href="javascript:void(0)" onClick={() => window.location.reload()}>Retry</a>
        </div>
      ) : (
        <div className={`table-wrap density-${density}`} style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 }}>
          <table>
            <thead>
              <tr>
                {isStaff && (
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={selected.size === tickets.length && tickets.length > 0} onChange={toggleAll} />
                  </th>
                )}
                <th className="sortable" onClick={() => toggleSort('reference')}>
                  Ticket No. <SortIcon field="reference" />
                </th>
                <th className="sortable" onClick={() => toggleSort('subject')}>
                  Subject <SortIcon field="subject" />
                </th>
                <th className="sortable" onClick={() => toggleSort('status')}>
                  Status <SortIcon field="status" />
                </th>
                <th className="sortable" onClick={() => toggleSort('priority')}>
                  Priority <SortIcon field="priority" />
                </th>
                <th>SLA</th>
                <th className="sortable" onClick={() => toggleSort('category')}>
                  Category <SortIcon field="category" />
                </th>
                <th>Subcategory</th>
                <th>Customer</th>
                {isStaff && <th>Assignee</th>}
                <th className="sortable" onClick={() => toggleSort('createdAt')}>
                  Age <SortIcon field="createdAt" />
                </th>
                <th className="sortable" onClick={() => toggleSort('updatedAt')}>
                  Updated <SortIcon field="updatedAt" />
                </th>
                <th style={{ width: 130 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={isStaff ? 13 : 11}>
                    <div className="empty-state">
                      <div className="empty-state-icon">🎫</div>
                      <div className="empty-state-title">No tickets found</div>
                      <div className="empty-state-body">Try adjusting your filters.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                tickets.map((t: any) => (
                  <tr key={t.id} className={selected.has(t.id) ? 'row-selected' : ''}>
                    {isStaff && (
                      <td style={{ width: 36 }}>
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} />
                      </td>
                    )}
                    <td>
                      <Link to={`/tickets/${t.id}`} className="ticket-num-link">
                        {t.reference}
                      </Link>
                      {t.slaBreached && <span className="sla-breached-dot" title="SLA Breached" />}
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      <Link to={`/tickets/${t.id}`} style={{ color: 'var(--text)', fontWeight: 500 }} className="truncate" title={t.subject}>
                        {t.subject}
                      </Link>
                      {t.tags?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                          {t.tags.slice(0, 3).map((tt: any) => (
                            <span key={tt.tagId} className="tag-chip" style={{ background: tt.tag.color + '22', color: tt.tag.color, borderColor: tt.tag.color + '44' }}>
                              {tt.tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td><span className={`badge ${t.status}`}>{STATUS_LABELS[t.status] ?? t.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span className={`priority-dot ${t.priority}`} />
                        <span className={`badge ${t.priority}`} title={PRIORITY_LABELS[t.priority]}>{PRIORITY_SHORT[t.priority] ?? t.priority}</span>
                      </div>
                    </td>
                    <td><SlaStatusBadge ticket={t} /></td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                      {t.category?.name ?? <span className="muted">—</span>}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                      {t.subcategory?.name ?? <span className="muted">—</span>}
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
                        <div className="user-cell" style={{ gap: 6 }}>
                          {t.assignedTo?.fullName && <Avatar name={t.assignedTo.fullName} />}
                          <select
                            value={t.assignedTo?.id ?? ''}
                            onChange={(e) => assignTicket(t.id, e.target.value)}
                            title="Assign agent"
                            aria-label={`Assignee for ${t.reference}`}
                            style={{ fontSize: 12.5, padding: '3px 6px', maxWidth: 140, marginBottom: 0 }}
                          >
                            <option value="">Unassigned</option>
                            {agents.map((a: any) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
                          </select>
                        </div>
                      </td>
                    )}
                    <td><AgeBadge createdAt={t.createdAt} /></td>
                    <td className="muted" style={{ fontSize: 12 }}>{relativeTime(t.updatedAt)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div className="row-actions">
                        <button
                          className="btn btn-ghost btn-xs"
                          title="Add comment"
                          aria-label={`Add comment to ${t.reference}`}
                          onClick={() => navigate(`/tickets/${t.id}#compose`)}
                        >💬</button>
                        <button
                          className="btn btn-ghost btn-xs"
                          title="Download PDF"
                          aria-label={`Download PDF for ${t.reference}`}
                          onClick={() => downloadTicketPdf(t)}
                        >↓</button>
                        {isStaff && !['RESOLVED', 'CLOSED'].includes(t.status) && (
                          <button
                            className="btn btn-ghost btn-xs"
                            title="Resolve ticket"
                            aria-label={`Resolve ${t.reference}`}
                            onClick={() => quickResolve(t.id)}
                          >✓</button>
                        )}
                      </div>
                    </td>
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
