# HelpDesk — Remaining Tasks

_Last updated: 2026-05-17_

Baseline: docs (00–04) are complete and signed off. All backend modules have real, working code **except** the items listed below. IMAP ingest, ticket creation, auth, notifications, reports, and the state machine are all fully implemented.

---

## 1. Environment & Infrastructure

- [ ] Add `.env.example` with all required variable names and placeholder values
- [ ] Write `docker-compose.yml` (postgres, backend, frontend, optional: redis for BullMQ)
- [ ] Write `Dockerfile` for backend (`node:20-alpine`, multi-stage build)
- [ ] Write `Dockerfile` for frontend (Vite build → nginx serve)
- [ ] Add health-check directives to docker-compose (depends_on with condition)
- [ ] Document local dev setup in `docs/05-Dev-Setup.md` (clone → env → migrate → seed → run)

---

## 2. Database

- [ ] Run `prisma migrate dev --name init` to generate the first migration file
- [ ] Verify `backend/prisma/seed.ts` covers: one admin, one agent, one customer, sample categories, SLA policies, and 2–3 tickets
- [ ] Add `prisma/migrations/` folder to source control (currently only `schema.prisma` exists)

---

## 3. Backend — Incomplete / Unimplemented

### Attachments (API spec § 5) — entirely missing
- [ ] Decide storage strategy: local disk (`multer` + static serve) or S3 (`@aws-sdk/client-s3` + presigned URLs)
- [ ] Add `multer` dependency; configure MIME type allowlist and size cap
- [ ] Implement `POST /tickets/:id/attachments` upload handler in `tickets.controller.ts`
- [ ] Implement `GET /attachments/:id` download/stream endpoint (new controller or added to tickets)
- [ ] Enforce ownership check before serving download (CUSTOMER may only access their own tickets' files)
- [ ] Add directory-traversal guard on storage key before any disk reads

### Admin settings (API spec § 8) — stub only
- [ ] `PATCH /admin/settings` at `scheduler/admin.controller.ts:30` echoes the request body and does nothing — no persistence
- [ ] `GET /admin/settings` reads `process.env` at request time only — no runtime override possible
- [ ] Add a `Settings` table to `schema.prisma` (or a key-value store) and wire both endpoints to it
- [ ] Decide which settings are runtime-mutable: `autoCloseDays`, `imapEnabled`, SMTP/IMAP credentials vs env-only

### Rate limiting (NFR)
- [ ] Add `@nestjs/throttler` to `app.module.ts` — not yet installed or configured
- [ ] Apply stricter limits per spec: `/auth/*` 10/min/IP, `POST /tickets` 30/min/user

### Round-robin assignment (optional per SRS FR-17)
- [ ] If desired, implement round-robin logic in `tickets.service.ts` — currently manual assign only

---

## 4. Frontend — Needs Verification

The following pages exist but were only partially readable during audit — need to confirm they are wired to the real API endpoints:

- [ ] **`TicketDetail.tsx`** — status-change dropdown, assign dropdown, internal-note toggle, watcher list, attachment upload/download
- [ ] **`AdminUsers.tsx`** — user CRUD (invite, edit role, toggle active) calls `POST/PATCH/DELETE /users`
- [ ] **`Reports.tsx`** — all five report views render (summary, workload, SLA, trends, CSV export)
- [ ] **`NotificationBell.tsx`** — Socket.IO connection, badge count, mark-read flow
- [ ] Add global error boundary component for unhandled API errors
- [ ] Add loading skeletons / empty-state components for ticket list and detail pages

---

## 5. Testing

_Architecture doc specifies Jest + Supertest (backend) and React Testing Library (frontend) — no test files exist yet._

### Backend
- [ ] Unit tests for `state-machine.ts` (all valid and invalid transitions)
- [ ] Unit tests for `tickets.service.ts` (create ticket, SLA computation, reopen on customer reply)
- [ ] Unit tests for `auth.service.ts` (register, login, token rotation, reset flow)
- [ ] Unit tests for `imap-ingest.service.ts` (reference matching, dedup, auto-provision)
- [ ] E2E tests (Supertest) for critical flows: auth → create ticket → status change → close
- [ ] Add `jest.config.ts` and `test/` scaffold

### Frontend
- [ ] Unit tests for `utils.ts` helpers (`relativeTime`, `avatarInitials`, label maps)
- [ ] Component tests for `NotificationBell`, `Login`, `NewTicket`
- [ ] Add `vitest` config (Vite project) or confirm Jest is wired via `vite.config.ts`

---

## 6. Documentation Gaps

_`docs/00-README.md` explicitly defers PM, QA, and Ops docs. These are still outstanding:_

- [ ] `docs/05-Dev-Setup.md` — local dev prerequisites, env setup, seed, run commands
- [ ] `docs/06-Deployment.md` — Docker Compose / cloud deploy steps, env var checklist
- [ ] `docs/07-Testing-Plan.md` — test scope, coverage targets, manual QA checklist
- [ ] `docs/08-Runbook.md` — IMAP connectivity checks, SLA cron monitoring, log locations, restart procedures

---

## 7. Security Hardening

- [ ] Confirm `helmet()` CSP is tuned for Socket.IO and Vite asset paths
- [ ] Add `CORS_ORIGIN` validation — currently accepts any origin if env var is missing
- [ ] Verify argon2 time/memory cost parameters are production-grade (not dev defaults)
- [ ] Ensure `ProcessedEmail.messageId` has a DB unique constraint (already in schema — verify migration applies it)
- [ ] Audit attachment download path for directory traversal once storage is implemented

---

## 8. CI / CD

- [ ] Add `.github/workflows/ci.yml` (lint → type-check → test → build on push/PR)
- [ ] Add separate `deploy.yml` if targeting a cloud provider

---

## Priority Order

| Priority | Area | Reason |
|----------|------|--------|
| **P0** | DB migrations + seed | Nothing runs without a real schema |
| **P0** | `.env.example` + docker-compose | Dev environment unbootable otherwise |
| **P1** | Attachments (upload + download) | API spec endpoints missing entirely |
| **P1** | Admin settings persistence | `PATCH /admin/settings` is a no-op stub |
| **P1** | Rate limiting | NFR — security gap |
| **P2** | Frontend page verification | Partial reads may hide broken wiring |
| **P2** | Backend unit + E2E tests | Required before any staging deploy |
| **P3** | Deferred docs (05–08) | Ops/QA prerequisite |
| **P3** | CI/CD pipeline | Needed before team handoff |
