import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

const PRIORITIES = [
  { value: 'LOW',    label: 'Low',    desc: 'Non-urgent, general questions' },
  { value: 'MEDIUM', label: 'Medium', desc: 'Standard support request' },
  { value: 'HIGH',   label: 'High',   desc: 'Significant impact, needs prompt attention' },
  { value: 'URGENT', label: 'Urgent', desc: 'Critical issue, business blocked' },
];

export default function NewTicket() {
  const nav = useNavigate();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/tickets', {
        subject,
        description,
        priority,
        categoryId: categoryId || undefined,
      });
      nav(`/tickets/${data.id}`);
    } catch (e: any) {
      setErr(e.response?.data?.error?.message ?? 'Failed to create ticket. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
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
            <textarea
              placeholder="Describe the problem in detail. Include any error messages, steps to reproduce, and what you expected to happen."
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— Select category —</option>
                {categories?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
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
