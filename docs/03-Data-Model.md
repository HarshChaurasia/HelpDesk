# Data Model / ERD

**Project:** Help Desk Ticketing System
**Version:** 0.1 (Draft)
**Date:** 2026-05-17
**DB:** PostgreSQL (via Prisma)

---

## 1. Entity Relationship Diagram

```
User 1───* Ticket (createdBy)
User 1───* Ticket (assignedTo, nullable)
User *───* Ticket            via TicketWatcher
Category 1───* Ticket
SlaPolicy 1───* Category
Ticket 1───* Message
Ticket 1───* TicketEvent      (audit/history)
Ticket 1───* Attachment
Message 1───* Attachment      (attachment belongs to ticket OR message)
User 1───* Notification
User 1───* RefreshToken
ProcessedEmail  (standalone dedupe ledger, optional link to Ticket/Message)
```

---

## 2. Enumerations

| Enum | Values |
|------|--------|
| `Role` | `CUSTOMER`, `AGENT`, `ADMIN` |
| `TicketStatus` | `NEW`, `OPEN`, `IN_PROGRESS`, `PENDING_CUSTOMER`, `RESOLVED`, `CLOSED`, `REOPENED` |
| `Priority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| `MessageType` | `PUBLIC_REPLY`, `INTERNAL_NOTE` |
| `Channel` | `WEB`, `EMAIL` |
| `NotifChannelPref` | `IN_APP`, `EMAIL`, `BOTH`, `OFF` |
| `EventType` | `CREATED`, `STATUS_CHANGED`, `ASSIGNED`, `PRIORITY_CHANGED`, `WATCHER_ADDED`, `WATCHER_REMOVED`, `MESSAGE_ADDED`, `REOPENED`, `CLOSED` |

---

## 3. Tables

### User
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| email | citext UNIQUE | login id |
| passwordHash | text | argon2/bcrypt; null if email-provisioned & not yet set |
| fullName | text | |
| role | Role | default `CUSTOMER` |
| isActive | bool | default true (soft deactivate) |
| notifPref | NotifChannelPref | default `BOTH` |
| createdAt / updatedAt | timestamptz | |

### SlaPolicy
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| responseMins | jsonb | per-priority targets, e.g. `{LOW:480,...}` |
| resolutionMins | jsonb | per-priority targets |
| createdAt / updatedAt | timestamptz | |

### Category
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text UNIQUE | |
| description | text | |
| slaPolicyId | uuid FK → SlaPolicy | nullable |
| isActive | bool | default true |

### Ticket
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| reference | text UNIQUE | human id `HD-000123` (sequence-backed) |
| subject | text | |
| status | TicketStatus | default `NEW` |
| priority | Priority | default `MEDIUM` |
| channel | Channel | how it was raised |
| categoryId | uuid FK → Category | nullable |
| createdById | uuid FK → User | customer |
| assignedToId | uuid FK → User | nullable, agent |
| firstResponseAt | timestamptz | null until first agent public reply |
| resolvedAt | timestamptz | nullable |
| closedAt | timestamptz | nullable |
| slaResponseDueAt | timestamptz | computed at create |
| slaResolutionDueAt | timestamptz | computed at create |
| slaBreached | bool | default false |
| lastCustomerActivityAt | timestamptz | drives auto-close |
| createdAt / updatedAt | timestamptz | |

Indexes: `(status)`, `(assignedToId, status)`, `(categoryId)`, `(createdById)`, `(reference)`, `(createdAt)`.

### TicketWatcher (join)
| Column | Type | Notes |
|--------|------|-------|
| ticketId | uuid FK → Ticket | |
| userId | uuid FK → User | |
| addedAt | timestamptz | |
| PK | (ticketId, userId) | composite |

### Message
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| ticketId | uuid FK → Ticket | |
| authorId | uuid FK → User | nullable if system/email-only sender |
| type | MessageType | public vs internal |
| body | text | |
| channel | Channel | WEB or EMAIL |
| sourceMessageId | text | email `Message-ID` if from mail, nullable |
| createdAt | timestamptz | |

Index: `(ticketId, createdAt)`.

### Attachment
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| ticketId | uuid FK → Ticket | nullable |
| messageId | uuid FK → Message | nullable (one of ticket/message set) |
| fileName | text | |
| mimeType | text | |
| sizeBytes | int | |
| storageKey | text | path/object key |
| uploadedById | uuid FK → User | nullable |
| createdAt | timestamptz | |

### TicketEvent (immutable audit/history)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| ticketId | uuid FK → Ticket | |
| actorId | uuid FK → User | nullable (system) |
| type | EventType | |
| fromValue | text | nullable (e.g. old status) |
| toValue | text | nullable (e.g. new status) |
| metadata | jsonb | freeform |
| createdAt | timestamptz | |

Index: `(ticketId, createdAt)`. No updates/deletes (append-only).

### Notification
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| userId | uuid FK → User | recipient |
| ticketId | uuid FK → Ticket | nullable |
| eventType | EventType | |
| title | text | |
| body | text | |
| isRead | bool | default false |
| emailSentAt | timestamptz | nullable |
| createdAt | timestamptz | |

Index: `(userId, isRead, createdAt)`.

### RefreshToken
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| userId | uuid FK → User | |
| tokenHash | text | hashed, rotating |
| expiresAt | timestamptz | |
| revokedAt | timestamptz | nullable |
| createdAt | timestamptz | |

### ProcessedEmail (IMAP dedupe ledger)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| messageId | text UNIQUE | email `Message-ID` |
| ticketId | uuid FK → Ticket | nullable |
| createdMessageId | uuid FK → Message | nullable |
| processedAt | timestamptz | |
| outcome | text | `CREATED_TICKET` / `APPENDED` / `IGNORED` |

### PasswordResetToken
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| userId | uuid FK → User | |
| tokenHash | text | |
| expiresAt | timestamptz | short TTL |
| usedAt | timestamptz | nullable |

---

## 4. Integrity & Rules
- `Ticket.reference` generated from a PostgreSQL sequence, zero-padded.
- Deleting a User: soft delete (`isActive=false`); tickets retained.
- `TicketWatcher` auto-rows: creator on create, assignee on assignment.
- `TicketEvent` is append-only — enforced at service layer (no update/delete endpoints).
- SLA due dates computed at creation from Category→SlaPolicy + Priority.
- `Attachment` must reference exactly one of `ticketId`/`messageId` (check constraint).
- All timestamps `timestamptz`, stored UTC.

## 5. Seed Data (dev)
- 1 ADMIN, 2 AGENT, 2 CUSTOMER users.
- Categories: `General`, `Billing`, `Technical`, `Account`.
- SLA policies: `Standard`, `Priority`.
- ~10 sample tickets across statuses for dashboard demo.
