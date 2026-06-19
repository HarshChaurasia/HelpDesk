import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth';
import RichTextEditor from '../components/RichTextEditor';
import UserCombobox, { UserOption } from '../components/UserCombobox';

const PRIORITIES = [
  { value: 'LOW',    label: 'Low',    desc: 'Non-urgent, general questions' },
  { value: 'MEDIUM', label: 'Medium', desc: 'Standard support request' },
  { value: 'HIGH',   label: 'High',   desc: 'Significant impact, needs prompt attention' },
  { value: 'URGENT', label: 'Urgent', desc: 'Critical issue, business blocked' },
];

export default function NewTicket() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isStaff = user?.role !== 'CUSTOMER';

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [assignees, setAssignees] = useState<UserOption[]>([]);
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
  });

  const { data: agents = [] } = useQuery<UserOption[]>({
    queryKey: ['agents'],
    queryFn: async () => (await api.get('/users/agents')).data,
    enabled: isStaff,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const descText = description.replace(/<[^>]*>/g, '').trim();
    if (!descText) { setErr('Description is required.'); return; }
    setErr('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/tickets', {
        subject,
        description,
        priority,
        categoryId: categoryId || undefined,
        subcategoryId: subcategoryId || undefined,
        assigneeIds: assignees.map((a) => a.id),
      });
      nav(`/tickets/${data.id}`);
    } catch (e: any) {
      setErr(e.response?.data?.error?.message ?? 'Failed to create ticket. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <div className="breadcrumb">
        <Link to="/tickets">Tickets</Link>
        <span className="breadcrumb-sep">›</span>
        <span>New Ticket</span>
      </div>

      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="page-title">Raise a support request</div>
          <div className="page-subtitle">Describe your issue and we'll get back to you as soon as possible.</div>
        </div>
      </div>

      <div className="card">
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Subject <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              placeholder="Brief summary of the issue"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
            <span className="form-hint">Keep it concise — one sentence works best.</span>
          </div>

          <div className="form-group">
            <label className="form-label">Description <span style={{ color: '#ef4444' }}>*</span></label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="Describe the problem in detail. Include any error messages, steps to reproduce, and what you expected to happen."
              minHeight={160}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); }}>
                <option value="">— Select category —</option>
                {categories?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {categoryId && (() => {
                const cat = categories?.find((c: any) => c.id === categoryId);
                const subs = cat?.subcategories ?? [];
                return subs.length > 0 ? (
                  <select style={{ marginTop: 6 }} value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
                    <option value="">— Subcategory —</option>
                    {subs.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : null;
              })()}
            </div>

            <div className="form-group">
              <label className="form-label">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label} — {p.desc}</option>
                ))}
              </select>
            </div>
          </div>

          {isStaff && (
            <div className="form-group">
              <label className="form-label">Assign to</label>
              <UserCombobox
                users={agents}
                selected={assignees}
                onChange={setAssignees}
                placeholder="Search agents…"
                multi={true}
              />
              <span className="form-hint">Optional. You can assign later from the ticket page.</span>
            </div>
          )}

          {err && <div className="alert alert-error">{err}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting && <span className="spinner" style={{ width: 13, height: 13 }} />}
              Submit ticket
            </button>
            <Link to="/tickets" className="btn btn-secondary">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
