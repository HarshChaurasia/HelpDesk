import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { avatarInitials, avatarStyle } from '../utils';

const ROLES = ['CUSTOMER', 'AGENT', 'ADMIN'] as const;
type Role = typeof ROLES[number];

function Avatar({ name }: { name: string }) {
  return (
    <div className="avatar" style={avatarStyle(name)}>{avatarInitials(name)}</div>
  );
}

export default function AdminUsers() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: '', fullName: '', role: 'AGENT' as Role, password: '' });
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setCreating(true);
    try {
      await api.post('/users', form);
      setForm({ email: '', fullName: '', role: 'AGENT', password: '' });
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e: any) {
      setErr(e.response?.data?.error?.message ?? 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  }

  async function setRole(id: string, role: string) {
    await api.patch(`/users/${id}`, { role });
    qc.invalidateQueries({ queryKey: ['users'] });
  }

  async function toggle(id: string, isActive: boolean) {
    await api.patch(`/users/${id}`, { isActive });
    qc.invalidateQueries({ queryKey: ['users'] });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">User Management</div>
          <div className="page-subtitle">Create and manage agent, admin, and customer accounts.</div>
        </div>
      </div>

      {/* Create user form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Create user</span>
        </div>
        <form onSubmit={create}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                type="email"
                placeholder="user@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Full name</label>
              <input
                placeholder="Jane Smith"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Temporary password</label>
              <input
                type="password"
                placeholder="Set initial password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>
          {err && <div className="alert alert-error">{err}</div>}
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating && <span className="spinner" style={{ width: 13, height: 13 }} />}
            Create user
          </button>
        </form>
      </div>

      {/* Users table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <span className="spinner" /> Loading users…
                  </div>
                </td>
              </tr>
            ) : users?.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <div className="empty-state-icon">👤</div>
                    <div className="empty-state-title">No users yet</div>
                  </div>
                </td>
              </tr>
            ) : (
              users?.map((u: any) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <Avatar name={u.fullName} />
                      <span style={{ fontWeight: 500 }}>{u.fullName}</span>
                    </div>
                  </td>
                  <td className="muted">{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      onChange={(e) => setRole(u.id, e.target.value)}
                      style={{ width: 'auto', fontSize: 13 }}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <span className={`badge ${u.isActive ? 'RESOLVED' : 'CLOSED'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`btn btn-xs ${u.isActive ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => toggle(u.id, !u.isActive)}
                    >
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
