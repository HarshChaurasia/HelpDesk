export const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  PENDING_CUSTOMER: 'Pending Customer',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'P4 – Low',
  MEDIUM: 'P3 – Medium',
  HIGH: 'P2 – High',
  URGENT: 'P1 – Urgent',
};

export const PRIORITY_SHORT: Record<string, string> = {
  LOW: 'P4',
  MEDIUM: 'P3',
  HIGH: 'P2',
  URGENT: 'P1',
};

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316',
  '#10b981', '#06b6d4', '#3b82f6', '#f59e0b',
];

export function avatarInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

export function avatarStyle(name: string): { background: string; color: string } {
  const hash = [...(name || 'U')].reduce(
    (h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0,
    0,
  );
  return { background: AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length], color: '#fff' };
}

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
