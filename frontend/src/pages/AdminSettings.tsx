import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';

/* ─── helpers ─── */
type Tab = 'email' | 'sla' | 'categories' | 'dropdowns' | 'system';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 12, marginTop: 20 }}>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}

function TestResult({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return (
    <div className={`alert ${result.ok ? 'alert-success' : 'alert-error'}`} style={{ marginTop: 10, marginBottom: 0 }}>
      {result.ok ? '✓ ' : '✗ '}{result.message}
    </div>
  );
}

/* ═══════════════════════════════════════
   EMAIL TAB
═══════════════════════════════════════ */
function EmailSettings() {
  const qc = useQueryClient();
  const [smtpTest, setSmtpTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [imapTest, setImapTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState<'smtp' | 'imap' | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => (await api.get('/admin/settings')).data,
  });

  const [form, setForm] = useState<Record<string, any>>({});
  const effectiveForm = { ...settings, ...form };

  const f = (key: string) => effectiveForm[key] ?? '';
  const set = (key: string, val: any) => setForm((p) => ({ ...p, [key]: val }));

  const saveMutation = useMutation({
    mutationFn: (data: any) => api.patch('/admin/settings', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      setForm({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  async function testSmtp() {
    setTesting('smtp');
    setSmtpTest(null);
    try {
      const res = await api.post('/admin/settings/test-smtp', {
        smtpHost:   f('smtpHost')   || undefined,
        smtpPort:   f('smtpPort')   || undefined,
        smtpSecure: f('smtpSecure') || undefined,
        smtpUser:   f('smtpUser')   || undefined,
        smtpPass:   f('smtpPass')   || undefined,
        mailFrom:   f('mailFrom')   || undefined,
      });
      setSmtpTest(res.data);
    } catch (e: any) {
      setSmtpTest({ ok: false, message: e.response?.data?.error?.message ?? 'Request failed' });
    } finally {
      setTesting(null);
    }
  }

  async function testImap() {
    setTesting('imap');
    setImapTest(null);
    try {
      const res = await api.post('/admin/settings/test-imap', {
        imapHost:   f('imapHost')   || undefined,
        imapPort:   f('imapPort')   || undefined,
        imapSecure: f('imapSecure') ?? undefined,
        imapUser:   f('imapUser')   || undefined,
        imapPass:   f('imapPass')   || undefined,
      });
      setImapTest(res.data);
    } catch (e: any) {
      setImapTest({ ok: false, message: e.response?.data?.error?.message ?? 'Request failed' });
    } finally {
      setTesting(null);
    }
  }

function handleSave(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate(form);
  }

  if (isLoading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}><span className="spinner" /> Loading settings…</div>;

  return (
    <form onSubmit={handleSave}>
      {/* ── SMTP ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Outbound Email (SMTP)</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={testSmtp}
            disabled={testing === 'smtp'}
          >
            {testing === 'smtp' ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Testing…</> : 'Test connection'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Field label="SMTP Host">
            <input placeholder="smtp.example.com" value={f('smtpHost')} onChange={(e) => set('smtpHost', e.target.value)} />
          </Field>
          <Field label="Port">
            <input type="number" placeholder="587" value={f('smtpPort')} onChange={(e) => set('smtpPort', parseInt(e.target.value, 10))} />
          </Field>
          <Field label="Username">
            <input placeholder="user@example.com" value={f('smtpUser')} onChange={(e) => set('smtpUser', e.target.value)} />
          </Field>
          <Field label="Password">
            <input type="password" placeholder={f('smtpPass') === '***' ? 'Password saved — enter new to change' : 'SMTP password'} onChange={(e) => set('smtpPass', e.target.value)} />
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="From address" hint='Shown as the "From" on outgoing emails'>
              <input placeholder="Help Desk <support@example.com>" value={f('mailFrom')} onChange={(e) => set('mailFrom', e.target.value)} />
            </Field>
          </div>
          <Field label="TLS / SSL">
            <div className="checkbox-row" style={{ marginTop: 6 }}>
              <input type="checkbox" id="smtpSecure" checked={!!f('smtpSecure')} onChange={(e) => set('smtpSecure', e.target.checked)} />
              <label htmlFor="smtpSecure">Use TLS (port 465)</label>
            </div>
          </Field>
        </div>
        <TestResult result={smtpTest} />
      </div>

      {/* ── IMAP ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Inbound Email (IMAP)</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="checkbox-row">
              <input type="checkbox" id="imapEnabled" checked={!!f('imapEnabled')} onChange={(e) => set('imapEnabled', e.target.checked)} />
              <label htmlFor="imapEnabled" style={{ color: 'var(--text-2)', fontSize: 13 }}>Enabled</label>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={testImap}
              disabled={!!testing}
            >
              {testing === 'imap' ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Testing…</> : 'Test connection'}
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Field label="IMAP Host">
            <input placeholder="imap.example.com" value={f('imapHost')} onChange={(e) => set('imapHost', e.target.value)} />
          </Field>
          <Field label="Port">
            <input type="number" placeholder="993" value={f('imapPort')} onChange={(e) => set('imapPort', parseInt(e.target.value, 10))} />
          </Field>
          <Field label="Username">
            <input placeholder="support@example.com" value={f('imapUser')} onChange={(e) => set('imapUser', e.target.value)} />
          </Field>
          <Field label="Password">
            <input type="password" placeholder={f('imapPass') === '***' ? 'Password saved — enter new to change' : 'IMAP password'} onChange={(e) => set('imapPass', e.target.value)} />
          </Field>
          <Field label="TLS / SSL">
            <div className="checkbox-row" style={{ marginTop: 6 }}>
              <input type="checkbox" id="imapSecure" checked={!!f('imapSecure')} onChange={(e) => set('imapSecure', e.target.checked)} />
              <label htmlFor="imapSecure">Use TLS (port 993)</label>
            </div>
          </Field>
        </div>
        <div className="alert alert-info" style={{ marginTop: 10 }}>
          Emails sent to this inbox are automatically converted into tickets. To reply to a ticket, keep <code>[HD-XXXXXX]</code> in the subject line.
        </div>
        <TestResult result={imapTest} />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary" type="submit" disabled={saveMutation.isPending || Object.keys(form).length === 0}>
          {saveMutation.isPending && <span className="spinner" style={{ width: 13, height: 13 }} />}
          Save changes
        </button>
        {saved && <span style={{ color: '#16a34a', fontSize: 13 }}>✓ Saved</span>}
        {saveMutation.isError && <span style={{ color: '#b91c1c', fontSize: 13 }}>Failed to save</span>}
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════
   SLA POLICIES TAB
═══════════════════════════════════════ */
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

function SlaSettings() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const blank: { name: string; responseMins: Record<string, number>; resolutionMins: Record<string, number> } = { name: '', responseMins: { LOW: 480, MEDIUM: 240, HIGH: 120, URGENT: 30 }, resolutionMins: { LOW: 4320, MEDIUM: 2880, HIGH: 1440, URGENT: 480 } };
  const [newForm, setNewForm] = useState(blank);
  const [editForm, setEditForm] = useState<any>(null);

  const { data: policies, isLoading } = useQuery({
    queryKey: ['sla-policies'],
    queryFn: async () => (await api.get('/sla-policies')).data,
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => api.post('/sla-policies', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sla-policies'] }); setCreating(false); setNewForm(blank); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/sla-policies/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sla-policies'] }); setEditing(null); },
  });

  function startEdit(p: any) {
    setEditing(p.id);
    setEditForm({ name: p.name, responseMins: { ...p.responseMins }, resolutionMins: { ...p.resolutionMins } });
  }

  if (isLoading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}><span className="spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Response and resolution time targets by priority level (minutes).</p>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>Add policy</button>
      </div>

      {/* existing policies */}
      {policies?.map((p: any) => (
        <div key={p.id} className="card" style={{ marginBottom: 12 }}>
          {editing === p.id ? (
            <div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Policy name</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <SlaMatrix label="Response time (mins)" value={editForm.responseMins} onChange={(v) => setEditForm({ ...editForm, responseMins: v })} />
              <SlaMatrix label="Resolution time (mins)" value={editForm.resolutionMins} onChange={(v) => setEditForm({ ...editForm, resolutionMins: v })} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => updateMutation.mutate({ id: p.id, ...editForm })} disabled={updateMutation.isPending}>Save</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="card-header">
                <span className="card-title">{p.name}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => startEdit(p)}>Edit</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <SlaMatrixReadonly label="Response (mins)" value={p.responseMins} />
                <SlaMatrixReadonly label="Resolution (mins)" value={p.resolutionMins} />
              </div>
            </div>
          )}
        </div>
      ))}

      {/* create new */}
      {creating && (
        <div className="card" style={{ borderColor: 'var(--brand)' }}>
          <div className="card-header"><span className="card-title">New SLA policy</span></div>
          <div className="form-group">
            <label className="form-label">Policy name</label>
            <input placeholder="e.g. Premium" value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} />
          </div>
          <SlaMatrix label="Response time (mins)" value={newForm.responseMins} onChange={(v) => setNewForm({ ...newForm, responseMins: v })} />
          <SlaMatrix label="Resolution time (mins)" value={newForm.resolutionMins} onChange={(v) => setNewForm({ ...newForm, resolutionMins: v })} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => createMutation.mutate(newForm)} disabled={createMutation.isPending || !newForm.name}>
              {createMutation.isPending && <span className="spinner" style={{ width: 12, height: 12 }} />} Create
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SlaMatrix({ label, value, onChange }: { label: string; value: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="form-label" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {PRIORITIES.map((p) => (
          <div key={p}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 3 }}>{p}</div>
            <input
              type="number"
              min={1}
              value={value[p] ?? ''}
              onChange={(e) => onChange({ ...value, [p]: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SlaMatrixReadonly({ label, value }: { label: string; value: Record<string, number> }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {PRIORITIES.map((p) => (
          <div key={p} style={{ background: 'var(--surface-sunken)', borderRadius: 6, padding: '6px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600 }}>{p}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{value?.[p] ?? '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   CATEGORIES TAB
═══════════════════════════════════════ */
function SubcategoryManager({ category }: { category: any }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const subs: any[] = category.subcategories ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['categories-admin'] });
    qc.invalidateQueries({ queryKey: ['categories'] }); // keep ticket forms in sync
  };

  const addMut = useMutation({
    mutationFn: (n: string) => api.post(`/categories/${category.id}/subcategories`, { name: n }),
    onSuccess: () => { invalidate(); setName(''); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${category.id}/subcategories/${id}`),
    onSuccess: invalidate,
  });

  const canAdd = name.trim().length >= 2;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {subs.length === 0 && <span className="muted" style={{ fontSize: 12 }}>None yet</span>}
      {subs.map((s: any) => (
        <span key={s.id} className="tag-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {s.name}
          <button
            type="button"
            onClick={() => delMut.mutate(s.id)}
            disabled={delMut.isPending}
            title="Remove subcategory"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', padding: 0, fontSize: 13, lineHeight: 1 }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) { e.preventDefault(); addMut.mutate(name.trim()); } }}
        placeholder="+ add"
        style={{ fontSize: 12, padding: '2px 6px', width: 84, marginBottom: 0 }}
      />
      {canAdd && (
        <button className="btn btn-secondary btn-xs" onClick={() => addMut.mutate(name.trim())} disabled={addMut.isPending}>Add</button>
      )}
    </div>
  );
}

function CategorySettings() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', description: '', slaPolicyId: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories-admin'],
    queryFn: async () => (await api.get('/categories')).data,
  });

  const { data: policies } = useQuery({
    queryKey: ['sla-policies'],
    queryFn: async () => (await api.get('/sla-policies')).data,
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => api.post('/categories', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories-admin'] }); setCreating(false); setNewForm({ name: '', description: '', slaPolicyId: '' }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/categories/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories-admin'] }); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories-admin'] }),
  });

  if (isLoading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}><span className="spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Ticket categories control how tickets are classified and which SLA policy applies.</p>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>Add category</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>SLA Policy</th>
              <th>Subcategories</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories?.length === 0 && (
              <tr><td colSpan={5}><div className="empty-state"><div className="empty-state-icon">🏷️</div><div className="empty-state-title">No categories yet</div></div></td></tr>
            )}
            {categories?.map((c: any) => (
              <tr key={c.id}>
                {editing === c.id ? (
                  <>
                    <td><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={{ marginBottom: 0 }} /></td>
                    <td><input value={editForm.description ?? ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Optional" style={{ marginBottom: 0 }} /></td>
                    <td>
                      <select value={editForm.slaPolicyId ?? ''} onChange={(e) => setEditForm({ ...editForm, slaPolicyId: e.target.value || null })} style={{ width: 'auto', marginBottom: 0 }}>
                        <option value="">No SLA</option>
                        {policies?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td><SubcategoryManager category={c} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary btn-xs" onClick={() => updateMutation.mutate({ id: c.id, ...editForm })} disabled={updateMutation.isPending}>Save</button>
                        <button className="btn btn-secondary btn-xs" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td className="muted">{c.description || '—'}</td>
                    <td>{c.slaPolicy ? <span className="badge OPEN">{c.slaPolicy.name}</span> : <span className="muted">—</span>}</td>
                    <td><SubcategoryManager category={c} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-xs" onClick={() => { setEditing(c.id); setEditForm({ name: c.name, description: c.description ?? '', slaPolicyId: c.slaPolicyId ?? '' }); }}>Edit</button>
                        <button className="btn btn-xs btn-danger" onClick={() => deleteMutation.mutate(c.id)}>Delete</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {creating && (
              <tr>
                <td><input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="Category name" style={{ marginBottom: 0 }} /></td>
                <td><input value={newForm.description} onChange={(e) => setNewForm({ ...newForm, description: e.target.value })} placeholder="Optional" style={{ marginBottom: 0 }} /></td>
                <td>
                  <select value={newForm.slaPolicyId} onChange={(e) => setNewForm({ ...newForm, slaPolicyId: e.target.value })} style={{ width: 'auto', marginBottom: 0 }}>
                    <option value="">No SLA</option>
                    {policies?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td><span className="muted" style={{ fontSize: 12 }}>Save first, then add</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary btn-xs" onClick={() => createMutation.mutate({ ...newForm, slaPolicyId: newForm.slaPolicyId || undefined })} disabled={!newForm.name || createMutation.isPending}>Add</button>
                    <button className="btn btn-secondary btn-xs" onClick={() => setCreating(false)}>Cancel</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   SYSTEM TAB
═══════════════════════════════════════ */
function SystemSettings() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [autoCloseDays, setAutoCloseDays] = useState<number | ''>('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => (await api.get('/admin/settings')).data,
  });

  const current = autoCloseDays !== '' ? autoCloseDays : (settings?.autoCloseDays ?? 5);

  const saveMutation = useMutation({
    mutationFn: (d: any) => api.patch('/admin/settings', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (isLoading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}><span className="spinner" /></div>;

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div className="card-header"><span className="card-title">Ticket lifecycle</span></div>
      <Field
        label="Auto-close after (days)"
        hint="Resolved tickets are automatically closed after this many days of inactivity."
      >
        <input
          type="number"
          min={1}
          max={365}
          value={current}
          onChange={(e) => setAutoCloseDays(parseInt(e.target.value, 10) || '')}
          style={{ maxWidth: 120 }}
        />
      </Field>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => saveMutation.mutate({ autoCloseDays: current })}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending && <span className="spinner" style={{ width: 12, height: 12 }} />}
          Save
        </button>
        {saved && <span style={{ color: '#16a34a', fontSize: 13 }}>✓ Saved</span>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   DROPDOWNS TAB — configurable option lists
═══════════════════════════════════════ */
function OptionListEditor({ title, hint, options, onChange }: {
  title: string; hint: string; options: string[]; onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState('');
  function add() {
    const v = input.trim();
    if (!v || options.includes(v)) { setInput(''); return; }
    onChange([...options, v]);
    setInput('');
  }
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header"><span className="card-title">{title}</span></div>
      <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 0 }}>{hint}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {options.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No options yet.</span>}
        {options.map((o) => (
          <span key={o} className="tag-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {o}
            <button type="button" aria-label={`Remove ${o}`} onClick={() => onChange(options.filter((x) => x !== o))}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 13, lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, maxWidth: 360 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Add option…" style={{ fontSize: 13, padding: '5px 8px', flex: 1, marginBottom: 0 }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function DropdownSettings() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { data, isLoading } = useQuery<{ resolutionOptions: string[] }>({
    queryKey: ['admin-config'],
    queryFn: async () => (await api.get('/admin/config')).data,
  });
  const [resolutionOptions, setResolutionOptions] = useState<string[] | null>(null);
  const current = resolutionOptions ?? data?.resolutionOptions ?? [];

  const save = useMutation({
    mutationFn: () => api.put('/admin/config', { resolutionOptions: current }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (isLoading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}><span className="spinner" /></div>;

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Manage the option lists that appear as dropdowns on tickets.</p>
      <OptionListEditor
        title="Resolution"
        hint="Shown as the Resolution dropdown on the ticket detail page."
        options={current}
        onChange={setResolutionOptions}
      />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary btn-sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </button>
        {saved && <span style={{ color: '#16a34a', fontSize: 13 }}>✓ Saved</span>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   ROOT PAGE
═══════════════════════════════════════ */
const TABS: { key: Tab; label: string }[] = [
  { key: 'email',      label: 'Email' },
  { key: 'sla',        label: 'SLA Policies' },
  { key: 'categories', label: 'Categories' },
  { key: 'dropdowns',  label: 'Dropdowns' },
  { key: 'system',     label: 'System' },
];

export default function AdminSettings() {
  const [tab, setTab] = useState<Tab>('email');

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Configure email, SLA targets, ticket categories, and system behaviour.</div>
        </div>
      </div>

      <div className="tab-group" style={{ marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'email'      && <EmailSettings />}
      {tab === 'sla'        && <SlaSettings />}
      {tab === 'categories' && <CategorySettings />}
      {tab === 'dropdowns'  && <DropdownSettings />}
      {tab === 'system'     && <SystemSettings />}
    </div>
  );
}
