# Software Requirements Specification (SRS)

**Project:** Help Desk Ticketing System
**Version:** 0.1 (Draft)
**Date:** 2026-05-17

---

## 1. Introduction

### 1.1 Purpose
Define the requirements for a Help Desk ticketing system that lets customers
raise support requests (via web form or email), routes those tickets to support
agents for resolution, and keeps interested parties notified of status changes.

### 1.2 Scope
A web application with:
- Customer-facing ticket submission and tracking.
- Email-to-ticket automatic creation via IMAP polling.
- Agent workspace for triage, assignment, and resolution.
- Admin dashboard for users, assignment rules, reporting.
- Notifications (in-app + email) to watchers/listeners on status changes.

Out of scope for v1: live chat, phone/CTI integration, SLA billing,
multi-tenant/multi-org, mobile native apps, knowledge base.

### 1.3 Definitions
| Term | Meaning |
|------|---------|
| Ticket | A support request with a lifecycle and history. |
| Agent | Staff user who works and resolves tickets. |
| Watcher / Listener | A user subscribed to a ticket's notifications. |
| SLA | Target response/resolution time per priority. |
| Thread | Ordered sequence of messages/comments on a ticket. |

---

## 2. Actors & Roles (RBAC)

| Role | Description | Key permissions |
|------|-------------|-----------------|
| `CUSTOMER` | Raises and tracks own tickets. | Create ticket, view/comment own tickets, reopen own resolved ticket. |
| `AGENT` | Resolves assigned tickets. | View queue, self-assign or be assigned, comment, change status/priority, add internal notes, manage watchers. |
| `ADMIN` | Manages the system. | All AGENT permissions + user CRUD, role assignment, category/SLA config, assignment rules, reports, reassign any ticket. |
| `SYSTEM` | Automated actor (email intake, scheduler). | Create tickets from email, send notifications, run SLA checks. |

---

## 3. Functional Requirements

### 3.1 Authentication & Users
- FR-1: Users register/login with email + password; passwords hashed (bcrypt/argon2).
- FR-2: JWT access token + refresh token; role embedded in token claims.
- FR-3: Admin can create, deactivate, and change roles of users.
- FR-4: Password reset via emailed time-limited token.
- FR-5: Customer accounts may be auto-provisioned when an unknown sender emails support.

### 3.2 Ticket Creation
- FR-6: Customer submits ticket via web form: subject, description, category, priority (suggested), attachments.
- FR-7: System creates a ticket from inbound email: sender → customer, subject → title, body → first message, attachments preserved.
- FR-8: Email replies matching an existing ticket reference (subject token e.g. `[HD-1234]`) append to that ticket's thread instead of creating a new one.
- FR-9: Every ticket gets a unique human-readable reference (e.g. `HD-000123`).

### 3.3 Ticket Lifecycle
- FR-10: Status values: `NEW → OPEN → IN_PROGRESS → PENDING_CUSTOMER → RESOLVED → CLOSED`; plus `REOPENED`.
- FR-11: Allowed transitions enforced server-side (state machine).
- FR-12: Priority: `LOW`, `MEDIUM`, `HIGH`, `URGENT`.
- FR-13: Customer reply on a `RESOLVED` ticket auto-transitions to `REOPENED`.
- FR-14: Auto-close `RESOLVED` tickets after N days of customer inactivity (configurable).

### 3.4 Assignment
- FR-15: Admin/Agent can assign a ticket to an agent.
- FR-16: Agents can self-assign from an unassigned queue.
- FR-17: Optional auto-assignment rule: round-robin within the ticket's category group.
- FR-18: Reassignment is logged in ticket history.

### 3.5 Collaboration
- FR-19: Threaded messages on a ticket (customer-visible) and internal notes (agent/admin only).
- FR-20: Attachments on tickets and messages (size/type limits configurable).
- FR-21: Full activity/audit timeline per ticket (status, assignment, priority, watcher changes).

### 3.6 Notifications / Listeners
- FR-22: Users can be added as watchers to a ticket; ticket creator and assignee are watchers by default.
- FR-23: On state-change events (created, assigned, status change, new public reply, resolved/closed), notify watchers via in-app notification and email.
- FR-24: In-app notifications delivered in real time (WebSocket) and persisted with read/unread state.
- FR-25: Each user can configure notification channel preferences (in-app, email, both, off).

### 3.7 Dashboards & Reporting
- FR-26: Customer dashboard: my tickets, statuses, last update.
- FR-27: Agent dashboard: assigned to me, unassigned queue, due-soon, filters/search.
- FR-28: Admin dashboard: volume by status/priority/category, agent workload, avg first-response & resolution time, SLA breach count, trend over time.
- FR-29: Export reports as CSV.

### 3.8 Configuration (Admin)
- FR-30: CRUD categories and link each to an SLA policy.
- FR-31: Define SLA policies (response/resolution targets per priority).
- FR-32: Configure auto-close window, IMAP mailbox settings, assignment strategy.

---

## 4. Non-Functional Requirements

- NFR-1 **Performance:** ticket list/search responds < 500 ms p95 at 10k tickets.
- NFR-2 **Scalability:** stateless API horizontally scalable; background workers separate from API.
- NFR-3 **Security:** RBAC enforced server-side; OWASP Top 10 mitigations; input validation; rate limiting on auth & ticket-create; attachments virus-scannable hook; secrets in env, not code.
- NFR-4 **Availability:** target 99.5%; graceful degradation if IMAP/email down (queue & retry).
- NFR-5 **Auditability:** immutable ticket history; structured logs.
- NFR-6 **Usability:** responsive UI, WCAG 2.1 AA-aimed, < 3 clicks to raise a ticket.
- NFR-7 **Data retention:** soft-delete tickets/users; configurable retention.
- NFR-8 **Observability:** health endpoint, request logging, metrics counters (tickets created, notifications sent, IMAP poll outcomes).

---

## 5. Key Use Cases

### UC-1 Customer raises ticket via form
1. Customer logs in, opens "New Ticket".
2. Fills subject, description, category, attachments.
3. System creates ticket `NEW`, assigns reference, adds creator as watcher.
4. Watchers notified; auto-assignment rule runs if enabled.

### UC-2 Email becomes a ticket
1. IMAP poller fetches unseen messages from support mailbox.
2. For each: match reference token in subject.
   - Match → append message to existing ticket (reopen if resolved).
   - No match → find/create customer by sender, create new ticket.
3. Mark message processed; notify watchers.

### UC-3 Agent resolves ticket
1. Agent opens assigned ticket, reviews thread.
2. Adds public reply / internal note, changes status `IN_PROGRESS` → `RESOLVED`.
3. Watchers notified; SLA timers stop on resolution.

### UC-4 Admin reviews performance
1. Admin opens dashboard, filters by date range/category.
2. Views volume, workload, SLA breaches; exports CSV.

---

## 6. Assumptions & Constraints
- Single organization, single support mailbox (v1).
- One PostgreSQL database; object/file storage for attachments (local disk v1, S3-compatible later).
- Email sending via SMTP provider; inbound via IMAP polling on an interval (default 60s).
- All times stored UTC.

## 7. Acceptance Criteria (high level)
- A customer can raise, track, and get notified about a ticket end-to-end.
- An email to the support mailbox creates/updates a ticket within one poll cycle.
- An agent can be assigned and move a ticket through to closed.
- Admin can manage users and see accurate report numbers.
- Unauthorized role actions are rejected (verified by tests).
