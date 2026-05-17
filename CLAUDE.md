# HelpDesk — Project Guide for Claude

## What this project is

A full-stack customer support ticketing system. Customers raise tickets via web or email. Agents triage, reply, and resolve them. Admins manage users and view SLA/analytics. Built as a monorepo.

## Stack at a glance

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5, React Router 6, TanStack Query 5, Socket.IO client |
| Backend | NestJS 10 (TypeScript), Prisma 5, PostgreSQL 16 |
| Auth | JWT (15 min access + 7 day refresh via cookie), Argon2 |
| Email | Nodemailer (SMTP out), IMAPflow (IMAP polling in) |
| Real-time | Socket.IO WebSocket gateway on `/ws` |
| Dev infra | Docker Compose: PostgreSQL (5432), MailHog (8025), API (3000) |

## Roles

- **CUSTOMER** — can create/view own tickets, reply, reopen resolved tickets
- **AGENT** — full ticket management (assign, status change, internal notes), view reports
- **ADMIN** — everything agents can do + manage users, view SLA data, export CSV

## Project layout

```
HelpDesk/
├── backend/
│   ├── src/
│   │   ├── auth/           JWT auth, password reset
│   │   ├── users/          User CRUD, roles
│   │   ├── tickets/        Core ticketing (messages, assignment, status FSM, watchers)
│   │   ├── categories/     Ticket categories
│   │   ├── notifications/  WebSocket gateway + in-app notifications
│   │   ├── mail/           IMAP polling, SMTP sending
│   │   ├── reports/        Analytics, CSV export
│   │   ├── scheduler/      Cron jobs (SLA breach detection, auto-close)
│   │   └── prisma/         Prisma service wrapper
│   └── prisma/
│       ├── schema.prisma   Full data model
│       └── seed.ts         Seed: admin / agent1 / customer1 @ helpdesk.local
├── frontend/
│   └── src/
│       ├── pages/          Login, Tickets, TicketDetail, NewTicket, AdminUsers, Reports
│       ├── components/     NotificationBell
│       ├── styles.css      Single global stylesheet (see UI system below)
│       ├── utils.ts        Label maps, avatar helpers, relative time formatting
│       ├── App.tsx         Router + sidebar layout
│       ├── auth.tsx        AuthContext, login/logout/register hooks
│       └── api.ts          Axios client with JWT refresh interceptor
└── docker-compose.yml
```

## Ticket lifecycle (status FSM)

```
NEW → OPEN → IN_PROGRESS → PENDING_CUSTOMER → RESOLVED → CLOSED (auto after 5 days)
                                                RESOLVED → REOPENED → IN_PROGRESS
```

Transitions are enforced server-side. `allowedTransitions[]` is returned per ticket.

## API base

All endpoints: `GET /api/v1/...`  
Swagger docs available at `http://localhost:3000/docs` when backend is running.

Key routes:
- `POST /auth/login` — login
- `GET  /tickets` — list (params: status, mine, unassigned, page)
- `GET  /tickets/:id` — detail (includes messages, events, watchers, allowedTransitions)
- `POST /tickets/:id/messages` — reply (type: PUBLIC_REPLY | INTERNAL_NOTE)
- `POST /tickets/:id/status` — change status
- `POST /tickets/:id/assign` — assign to agent
- `GET  /reports/summary` — ticket counts by status/priority/category
- `GET  /reports/sla` — breach count, avg response/resolution times
- `GET  /reports/export` — CSV download

## Frontend UI system

### Design approach
Modern Minimalist Light Mode. Clean white surfaces, Inter font, soft shadows, blue brand accent. Inspired by Zendesk/Freshdesk patterns — sidebar nav, two-column ticket detail, KPI stat cards.

### CSS variables (key tokens)
```
--text: #1f2937          Primary text (spec: #1F2937)
--text-2: #6b7280        Secondary text (spec: #6B7280)
--text-3: #9ca3af        Muted/placeholder
--brand: #2563eb         Blue accent (buttons, active links, brand)
--bg: #f8fafc            Page background
--surface: #ffffff       Card/panel background
--border: #e2e8f0        Default border
--side-bg: #0f172a       Dark sidebar
--side-w: 224px          Sidebar width
```

### Status badge colors (aligned with spec)
| Status | Background | Text |
|---|---|---|
| NEW | `#e0f2fe` | `#0369a1` (sky blue) |
| OPEN | `#d1fae5` | `#16a34a` (bright green — spec) |
| IN_PROGRESS | `#dbeafe` | `#2563eb` (accent blue — spec) |
| PENDING_CUSTOMER | `#ffedd5` | `#c2410c` (orange) |
| RESOLVED | `#dcfce7` | `#15803d` (dark green — spec) |
| CLOSED | `#f3f4f6` | `#6b7280` (gray) |
| REOPENED | `#fee2e2` | `#b91c1c` (red) |

### Priority badge colors
| Priority | Background | Text |
|---|---|---|
| URGENT | `#fee2e2` | `#dc2626` |
| HIGH | `#ffedd5` | `#ea580c` |
| MEDIUM | `#fef9c3` | `#ca8a04` |
| LOW | `#dcfce7` | `#16a34a` |

### Key CSS classes
```
.btn-primary / .btn-secondary / .btn-danger / .btn-ghost   — button variants
.btn-sm / .btn-xs                                          — size modifiers
.badge.{STATUS} / .badge.{PRIORITY}                        — auto-colored pills
.card / .card-header / .card-title                         — white card containers
.table-wrap / table / th / td                              — table with hover rows
.avatar / .avatar-sm / .avatar-lg                          — initials circle
.user-cell                                                  — flex row: avatar + name
.stat-card.{blue|green|amber|purple|red|orange|slate}      — KPI cards with color bar
.form-group / .form-label / .form-hint / .form-error       — labeled form fields
.tab-group / .tab-btn.active                               — horizontal tab switcher
.compose-box / .compose-tabs / .compose-tab                — reply/note composer
.timeline / .timeline-item                                 — activity timeline
.message / .message.INTERNAL_NOTE                          — conversation messages
.ticket-layout                                             — two-column grid (main + 280px sidebar)
.breadcrumb                                                — navigation trail
.empty-state                                               — no-data placeholder
.spinner                                                    — animated loading ring
.loading-page                                              — full-page centered spinner
.stats-grid                                                — auto-fit KPI card grid
.breakdown-row / .breakdown-bar                            — horizontal bar chart row
.filter-bar                                                — filter controls row
```

### utils.ts exports
```ts
STATUS_LABELS   — { NEW: 'New', IN_PROGRESS: 'In Progress', ... }
PRIORITY_LABELS — { LOW: 'Low', URGENT: 'Urgent', ... }
avatarInitials(name)  — 'Jane Smith' → 'JS'
avatarStyle(name)     — returns { background, color } for colored avatar
relativeTime(dateStr) — '2h ago', '3d ago', 'just now'
formatDate(dateStr)   — 'May 17, 10:30 AM'
```

## Dev setup

```bash
# Start DB + mail catcher
docker-compose up -d db mailhog

# Backend (port 3000)
cd backend && npm install
npx prisma migrate dev
npx prisma db seed
npm run start:dev

# Frontend (port 5173, proxied to backend)
cd frontend && npm install && npm run dev
```

Seed credentials: `admin@helpdesk.local / Passw0rd!`

## Automation / cron jobs (backend)

| Interval | Job |
|---|---|
| Every 1 min | IMAP email polling → creates/appends tickets |
| Every 10 min | SLA breach detection |
| Every hour | Auto-close RESOLVED tickets older than 5 days |

## Notifications

WebSocket gateway at `/ws` with JWT handshake auth. Frontend connects in `NotificationBell.tsx`. Event: `notification:new` → refetch unread count. Fallback: 30-second polling via TanStack Query `refetchInterval`.

## Things to know before making changes

- **No UI library** — all styling is plain CSS in `styles.css`. Add new utility classes there; don't add inline `style={}` unless truly one-off.
- **Badge class = enum value** — `<span className={\`badge ${t.status}\`}>` works because `.badge.IN_PROGRESS` etc. are defined in CSS. Keep enum values as class names, use `STATUS_LABELS` for display text.
- **State machine** — don't add status transitions in the UI; the backend returns `allowedTransitions[]` per ticket.
- **Roles** — `user?.role` is `'CUSTOMER' | 'AGENT' | 'ADMIN'`. Staff check: `user?.role !== 'CUSTOMER'`.
- **TanStack Query keys** — `['tickets', status, scope]`, `['ticket', id]`, `['agents']`, `['users']`, `['unread']`, `['notifs']`, `['rep-summary']`, `['rep-sla']`, `['categories']`.
- **Axios client** — `api` from `../api` handles base URL and JWT refresh. Don't use `fetch` directly.
