# System Architecture & Design

**Project:** Help Desk Ticketing System
**Version:** 0.1 (Draft)
**Date:** 2026-05-17

---

## 1. Architecture Overview

A modular monolith API (NestJS) + SPA frontend (React), backed by PostgreSQL,
with background workers for email intake and notifications.

```
                +---------------------------+
                |   React SPA (Vite + TS)   |
                |  Customer / Agent / Admin |
                +-------------+-------------+
                              | HTTPS (REST + WS)
                              v
                +---------------------------+
                |     NestJS API Gateway    |
                |  Auth | Tickets | Users   |
                |  Notifications | Reports  |
                +------+----------+---------+
                       |          |    \
            (Prisma ORM)|          |     \ WebSocket (Socket.IO)
                       v          v      v
        +--------------+    +-----------+   +------------------+
        | PostgreSQL   |    |  Redis*   |   |  Connected SPA   |
        | (core data)  |    | queue/cache|  |  clients         |
        +--------------+    +-----+-----+   +------------------+
                                  ^
                  +---------------+----------------+
                  |     Background Workers          |
                  |  - IMAP poller (cron)           |
                  |  - Notification dispatcher      |
                  |  - SLA / auto-close scheduler   |
                  +----------------+----------------+
                         |                  |
                    IMAP (inbound)      SMTP (outbound)
                  support mailbox      email provider

  * Redis optional in v1: in-process queue acceptable for low volume;
    Redis recommended once workers scale out.
```

### Deployment shape (v1)
- API container, Worker container (same image, different entrypoint), PostgreSQL, optional Redis.
- Reverse proxy (Nginx/Traefik) terminates TLS, serves built SPA static assets.
- Docker Compose for dev; same images promotable to a single host / small k8s later.

---

## 2. Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React + TypeScript + Vite | Fast DX, requested stack. |
| UI kit | Tailwind CSS + Headless UI (or MUI) | Simple, consistent, accessible components. |
| State/data | TanStack Query + Zustand | Server-cache + light client state. |
| Backend | NestJS (TypeScript) | Modular, DI, guards/interceptors fit RBAC well. |
| ORM | Prisma | Type-safe schema, migrations, good DX. |
| DB | PostgreSQL | Relational integrity, JSONB for flexible metadata. |
| Realtime | Socket.IO (NestJS gateway) | In-app notifications. |
| Auth | JWT (access+refresh), Passport | Stateless, role claims. |
| Email out | Nodemailer + SMTP | Standard. |
| Email in | `imapflow` + `mailparser` | Robust IMAP + MIME parsing. |
| Jobs | `@nestjs/schedule` (cron) + queue (BullMQ if Redis) | Polling & async notifications. |
| Validation | class-validator / Zod DTOs | Boundary validation. |
| Tests | Jest + Supertest, React Testing Library | Unit + e2e. |

---

## 3. Module Decomposition (NestJS)

- **AuthModule** — register/login/refresh, password reset, JWT strategy, RBAC guard + `@Roles()` decorator.
- **UsersModule** — user CRUD, roles, profile, notification preferences.
- **TicketsModule** — ticket CRUD, state machine, assignment, messages, internal notes, attachments, history.
- **CategoriesModule** — categories + SLA policies.
- **NotificationsModule** — event bus consumer, in-app persistence, email dispatch, WebSocket gateway, watcher management.
- **MailIngestModule** — IMAP poller, dedupe, reference matching, customer auto-provision.
- **ReportsModule** — aggregate queries, CSV export.
- **SchedulerModule** — SLA timers, auto-close, IMAP cron trigger.
- **CommonModule** — config, logging, error filter, audit interceptor.

Cross-module communication via an internal **event emitter** (`@nestjs/event-emitter`):
domain events (`ticket.created`, `ticket.assigned`, `ticket.status_changed`,
`ticket.message_added`) → NotificationsModule subscribes and fans out.

---

## 4. Key Design Flows

### 4.1 Ticket state machine
```
NEW ──▶ OPEN ──▶ IN_PROGRESS ──▶ PENDING_CUSTOMER ──▶ RESOLVED ──▶ CLOSED
  │        │           │                 │                │
  └────────┴───────────┴───────► (any) ──┘                ▼
                                              RESOLVED ──▶ REOPENED ──▶ IN_PROGRESS
```
Transitions validated in a `TicketStateService`; illegal transitions → 409.
Each transition writes a `TicketEvent` (audit) and emits a domain event.

### 4.2 Email-to-ticket (IMAP poll)
1. Cron (default 60s) triggers `MailIngestService.poll()`.
2. Open IMAP, fetch UNSEEN; for each message:
   - Parse MIME (headers, body, attachments).
   - Compute dedupe key from `Message-ID`; skip if already processed (`ProcessedEmail` table).
   - Extract `[HD-XXXXXX]` token from subject.
     - Found & ticket exists → append `Message`; if `RESOLVED` → `REOPENED`.
     - Not found → resolve customer by `from` (create `CUSTOMER` if new) → create ticket.
   - Persist attachments; mark message `\Seen`; insert `ProcessedEmail`.
3. Emit domain events → notifications.
4. Failures: leave unseen, log, retry next cycle; circuit-break after repeated auth failures.

### 4.3 Notification fan-out
- Domain event → NotificationsModule resolves watcher list (creator, assignee, explicit watchers; deduped).
- For each watcher, respect channel preference:
  - In-app: insert `Notification`, push via WebSocket to connected sockets of that user.
  - Email: enqueue templated email; SMTP send with retry/backoff.
- Outbound email subject includes `[HD-XXXXXX]` so replies thread back.

### 4.4 Auth & RBAC
- Login → access token (15 min) + refresh token (7 days, rotating, stored hashed).
- `JwtAuthGuard` + `RolesGuard`; `@Roles('ADMIN')` etc. on controllers.
- Ownership checks: customers restricted to their own tickets via a policy service.

---

## 5. Frontend Architecture

- Route-based code splitting; three role-scoped shells: Customer, Agent, Admin.
- Auth context stores tokens (access in memory, refresh in httpOnly cookie preferred); silent refresh.
- TanStack Query for all server data; optimistic updates on comment/status.
- Socket.IO client subscribes on login → toast + notification bell badge.
- Shared component lib: TicketCard, StatusBadge, PriorityTag, Timeline, Filters, DataTable, Charts (Recharts).
- Pages: Login/Register, Ticket list, Ticket detail/thread, New ticket, Notifications, Admin (Users, Categories/SLA, Reports, Settings).

---

## 6. Cross-Cutting Concerns

| Concern | Approach |
|---------|----------|
| Config | `@nestjs/config`, env-validated at boot. |
| Logging | Structured JSON (pino), request id correlation. |
| Errors | Global exception filter → consistent error envelope. |
| Audit | Interceptor + explicit `TicketEvent` writes. |
| Security | Helmet, CORS allowlist, rate limiting (auth/create), bcrypt/argon2, parameterized queries via Prisma, file type/size limits, signed download URLs. |
| Migrations | Prisma Migrate, versioned, run on deploy. |
| Health | `/health` (DB, IMAP reachability, SMTP). |
| Testing | Unit (services/state machine), e2e (auth, ticket lifecycle, mail ingest with mock IMAP), RBAC negative tests. |

---

## 7. Environments
- **dev** — Docker Compose, seeded data, MailHog/test IMAP.
- **staging** — production-like, real test mailbox.
- **prod** — TLS, backups (daily PG dump + retention), monitoring.

## 8. Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| IMAP duplicate/loop emails | `Message-ID` dedupe + `ProcessedEmail` table; ignore auto-reply headers. |
| Notification storm | Batch/debounce per ticket; rate-limit per recipient. |
| Lost emails on worker crash | Don't mark `\Seen` until persisted; idempotent processing. |
| Token leakage | Short access TTL, rotating refresh, httpOnly cookie. |
| Attachment abuse | Type/size limits, store outside webroot, optional AV hook. |
