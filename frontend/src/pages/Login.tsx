import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Login() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('admin@helpdesk.local');
  const [password, setPassword] = useState('Passw0rd!');
  const [fullName, setFullName] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, fullName);
      nav('/tickets');
    } catch (e: any) {
      setErr(e.response?.data?.error?.message ?? 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      <div className="login-box">
        <div className="login-logo">
          <div className="login-logo-icon">🎫</div>
          <div className="login-logo-name">Help Desk</div>
          <div className="login-logo-sub">Customer Support Portal</div>
        </div>

        <div className="login-card">
          <h2>{mode === 'login' ? 'Sign in to your account' : 'Create an account'}</h2>

          <form onSubmit={submit}>
            {mode === 'register' && (
              <div className="form-group">
                <label className="form-label">Full name</label>
                <input
                  placeholder="Jane Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {err && <div className="alert alert-error" style={{ marginBottom: 14 }}>{err}</div>}

            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        <div className="login-toggle">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </a>
        </div>

        <div className="login-hint">
          Demo — admin@helpdesk.local / Passw0rd!
        </div>
      </div>
    </div>
  );
}
