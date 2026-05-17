import { Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Login from './pages/Login';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import NewTicket from './pages/NewTicket';
import AdminUsers from './pages/AdminUsers';
import Reports from './pages/Reports';
import NotificationBell from './components/NotificationBell';
import { ReactNode } from 'react';
import { avatarInitials, avatarStyle } from './utils';

/* ─── Inline SVG icons ─── */
function IconTickets() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
      <path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/><path d="M12 5v14"/>
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/>
      <path d="m19 9-5 5-4-4-3 3"/>
    </svg>
  );
}
function IconLogout() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

/* ─── Nav item with active detection ─── */
function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  const { pathname } = useLocation();
  let active = false;
  if (to === '/tickets') {
    active = pathname === '/tickets' || (pathname.startsWith('/tickets/') && !pathname.startsWith('/tickets/new'));
  } else {
    active = pathname === to || pathname.startsWith(to + '/');
  }
  return (
    <Link to={to} className={`nav-item${active ? ' active' : ''}`}>
      <span className="nav-item-icon">{icon}</span>
      {label}
    </Link>
  );
}

/* ─── Sidebar + main layout ─── */
function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const initials = avatarInitials(user?.fullName ?? 'U');
  const style = avatarStyle(user?.fullName ?? 'U');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-inner">
            <div className="sidebar-logo-icon">🎫</div>
            <div>
              <div className="sidebar-logo-text">Help Desk</div>
              <div className="sidebar-logo-sub">Support Portal</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section">Tickets</div>
          <NavItem to="/tickets" icon={<IconTickets />} label="All Tickets" />
          <NavItem to="/tickets/new" icon={<IconPlus />} label="New Ticket" />

          {(user?.role === 'ADMIN' || user?.role === 'AGENT') && (
            <>
              <div className="sidebar-section">Analytics</div>
              <NavItem to="/reports" icon={<IconChart />} label="Reports" />
            </>
          )}

          {user?.role === 'ADMIN' && (
            <>
              <div className="sidebar-section">Admin</div>
              <NavItem to="/admin/users" icon={<IconUsers />} label="Users" />
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar avatar-sm" style={style}>{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.fullName}</div>
              <div className="sidebar-user-role">{user?.role}</div>
            </div>
            <button
              className="btn btn-ghost btn-xs"
              title="Sign out"
              style={{ padding: '4px 6px', color: 'var(--side-text)' }}
              onClick={async () => { await logout(); nav('/login'); }}
            >
              <IconLogout />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <div className="topbar-spacer" />
          <NotificationBell />
        </header>
        <div className="page-body">{children}</div>
      </div>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-page"><span className="spinner" /> Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/tickets" element={<Protected><Tickets /></Protected>} />
      <Route path="/tickets/new" element={<Protected><NewTicket /></Protected>} />
      <Route path="/tickets/:id" element={<Protected><TicketDetail /></Protected>} />
      <Route path="/admin/users" element={<Protected><AdminUsers /></Protected>} />
      <Route path="/reports" element={<Protected><Reports /></Protected>} />
      <Route path="*" element={<Navigate to="/tickets" replace />} />
    </Routes>
  );
}
