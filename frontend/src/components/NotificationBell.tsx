import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { api } from '../api';
import { relativeTime } from '../utils';

let socket: Socket | null = null;

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    </svg>
  );
}

export default function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: count } = useQuery({
    queryKey: ['unread'],
    queryFn: async () => (await api.get('/notifications/unread-count')).data.count as number,
    refetchInterval: 30000,
  });

  const { data: list } = useQuery({
    queryKey: ['notifs'],
    queryFn: async () => (await api.get('/notifications')).data,
    enabled: open,
  });

  useEffect(() => {
    api.post('/auth/refresh').then(({ data }) => {
      socket?.disconnect();
      socket = io({ path: '/ws', auth: { token: data.accessToken } });
      socket.on('notification:new', () => {
        qc.invalidateQueries({ queryKey: ['unread'] });
        qc.invalidateQueries({ queryKey: ['notifs'] });
      });
    });
    return () => { socket?.disconnect(); socket = null; };
  }, [qc]);

  async function markAll() {
    await api.post('/notifications/read-all');
    qc.invalidateQueries({ queryKey: ['unread'] });
    qc.invalidateQueries({ queryKey: ['notifs'] });
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="bell-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <BellIcon />
        {!!count && <span className="bell-badge">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <>
          {/* backdrop to close */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 199 }}
            onClick={() => setOpen(false)}
          />
          <div className="notif-dropdown">
            <div className="notif-header">
              <span className="notif-header-title">Notifications</span>
              {!!count && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={markAll}
                  style={{ fontSize: 12 }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {list?.length ? (
              list.map((n: any) => (
                <div key={n.id} className={`notif-item${n.isRead ? ' read' : ''}`}>
                  <div className="notif-title">{n.title}</div>
                  <div className="notif-body">{n.body}</div>
                  {n.createdAt && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                      {relativeTime(n.createdAt)}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="notif-empty">
                <div style={{ fontSize: 22, marginBottom: 6 }}>🔔</div>
                No notifications yet
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
