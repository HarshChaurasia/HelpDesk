# API Specification

**Project:** Help Desk Ticketing System
**Version:** 0.1 (Draft)
**Date:** 2026-05-17
**Base URL:** `/api/v1`
**Auth:** `Authorization: Bearer <accessToken>` unless noted public.

---

## 1. Conventions

- JSON request/response. Timestamps ISO-8601 UTC.
- Pagination: `?page=1&limit=20` → `{ data: [...], meta: { page, limit, total } }`.
- Filtering/sort (lists): `?status=&priority=&categoryId=&assignedToId=&q=&sort=-createdAt`.
- Error envelope:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [] } }
  ```
- Status codes: 200/201 ok, 204 no content, 400 validation, 401 unauthenticated,
  403 forbidden (role/ownership), 404 not found, 409 invalid state transition,
  422 business rule, 429 rate-limited.

### Role legend per endpoint
`C`=CUSTOMER, `A`=AGENT, `Ad`=ADMIN, `P`=public.

---

## 2. Auth

| Method | Path | Roles | Body / Notes |
|--------|------|-------|--------------|
| POST | `/auth/register` | P | `{email,password,fullName}` → creates CUSTOMER |
| POST | `/auth/login` | P | `{email,password}` → `{accessToken, user}` (+refresh cookie) |
| POST | `/auth/refresh` | P (cookie) | rotates refresh, returns new access |
| POST | `/auth/logout` | C/A/Ad | revokes refresh token |
| POST | `/auth/forgot-password` | P | `{email}` → emails reset token |
| POST | `/auth/reset-password` | P | `{token,newPassword}` |
| GET | `/auth/me` | C/A/Ad | current user profile |

---

## 3. Users (Admin)

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| GET | `/users` | Ad | list/filter `?role=&q=&isActive=` |
| POST | `/users` | Ad | `{email,fullName,role,password?}` |
| GET | `/users/:id` | Ad | |
| PATCH | `/users/:id` | Ad | `{fullName?,role?,isActive?}` |
| DELETE | `/users/:id` | Ad | soft deactivate |
| PATCH | `/users/me/notification-pref` | C/A/Ad | `{notifPref}` |

---

## 4. Categories & SLA (Admin manage, others read)

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| GET | `/categories` | C/A/Ad | active categories |
| POST | `/categories` | Ad | `{name,description,slaPolicyId?}` |
| PATCH | `/categories/:id` | Ad | |
| DELETE | `/categories/:id` | Ad | soft (`isActive=false`) |
| GET | `/sla-policies` | A/Ad | |
| POST | `/sla-policies` | Ad | `{name,responseMins,resolutionMins}` |
| PATCH | `/sla-policies/:id` | Ad | |

---

## 5. Tickets

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| GET | `/tickets` | C/A/Ad | C → own only; A/Ad → all + filters; supports `?mine=true`, `?unassigned=true` |
| POST | `/tickets` | C/A/Ad | create (see body below) |
| GET | `/tickets/:id` | C(owner/watcher)/A/Ad | includes messages (public; internal hidden from C), events, watchers, attachments |
| PATCH | `/tickets/:id` | A/Ad | `{subject?,priority?,categoryId?}` |
| POST | `/tickets/:id/status` | A/Ad (C limited) | `{status}` — state machine validated; C may only `REOPENED` on own RESOLVED |
| POST | `/tickets/:id/assign` | A/Ad | `{assignedToId}` (A self-assign: own id) |
| POST | `/tickets/:id/messages` | C(owner)/A/Ad | `{body,type}` — C forced `PUBLIC_REPLY`; `INTERNAL_NOTE` A/Ad only |
| GET | `/tickets/:id/events` | A/Ad / C(owner public subset) | audit timeline |
| POST | `/tickets/:id/watchers` | A/Ad | `{userId}` |
| DELETE | `/tickets/:id/watchers/:userId` | A/Ad | |
| POST | `/tickets/:id/attachments` | C(owner)/A/Ad | multipart; size/type limited |
| GET | `/attachments/:id` | authorized on ticket | signed/streamed download |

**Create ticket body**
```json
{
  "subject": "Cannot log in",
  "description": "Error 500 on login",
  "categoryId": "uuid|null",
  "priority": "MEDIUM",
  "attachmentIds": ["uuid"]   // optional, pre-uploaded
}
```
**201 response**
```json
{
  "id": "uuid",
  "reference": "HD-000123",
  "status": "NEW",
  "priority": "MEDIUM",
  "subject": "Cannot log in",
  "createdAt": "2026-05-17T10:00:00Z"
}
```

**Status transition errors:** illegal transition → `409 { error.code: "INVALID_TRANSITION" }`.

---

## 6. Notifications

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| GET | `/notifications` | C/A/Ad | own; `?isRead=&page=` |
| GET | `/notifications/unread-count` | C/A/Ad | `{count}` |
| POST | `/notifications/:id/read` | owner | mark read |
| POST | `/notifications/read-all` | C/A/Ad | |
| WS | `/ws` (Socket.IO, JWT handshake) | C/A/Ad | server emits `notification:new`, `ticket:updated` |

---

## 7. Reports (Agent read subset, Admin full)

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| GET | `/reports/summary` | A/Ad | counts by status/priority/category, date range |
| GET | `/reports/agent-workload` | Ad | open/assigned per agent |
| GET | `/reports/sla` | Ad | breach counts, avg first-response & resolution |
| GET | `/reports/trends` | Ad | created/resolved per day in range |
| GET | `/reports/export` | Ad | `?type=tickets&from=&to=` → CSV stream |

Query params: `?from=YYYY-MM-DD&to=YYYY-MM-DD&categoryId=`.

---

## 8. System / Ops

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| GET | `/health` | P | `{status, db, imap, smtp}` |
| POST | `/admin/mail/poll-now` | Ad | trigger IMAP poll manually |
| GET | `/admin/settings` | Ad | IMAP/SMTP/auto-close/assignment config |
| PATCH | `/admin/settings` | Ad | update config |

---

## 9. Internal (no public HTTP — documented for clarity)

- IMAP poller worker: cron-driven, calls internal `MailIngestService`.
- Notification dispatcher: consumes domain events, writes `Notification`, emits WS, sends SMTP.
- Scheduler: SLA breach flagging, auto-close of stale `RESOLVED` tickets.

---

## 10. Security Notes
- All non-public endpoints require valid JWT; `RolesGuard` enforces table roles.
- Ownership policy: CUSTOMER scoped to tickets where they are creator or watcher.
- Rate limits: `/auth/*` (10/min/IP), `POST /tickets` (30/min/user), attachments (size cap).
- Internal notes never serialized into CUSTOMER responses.
- Attachment downloads authorized against ticket access before streaming.

## 11. Versioning
- Path-versioned (`/api/v1`). Breaking changes → `/v2`. OpenAPI spec generated
  from NestJS decorators and published at `/api/docs` (non-prod).
