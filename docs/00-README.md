# Help Desk Ticketing System — SDLC Documentation

This folder contains the planning documents that must be reviewed and approved
before development begins.

| # | Document | Purpose |
|---|----------|---------|
| 01 | [Software Requirements Specification](01-SRS.md) | Scope, actors, functional & non-functional requirements, use cases |
| 02 | [System Architecture & Design](02-Architecture-Design.md) | High-level architecture, components, tech stack, key flows |
| 03 | [Data Model / ERD](03-Data-Model.md) | Entities, relationships, schema, enums |
| 04 | [API Specification](04-API-Specification.md) | REST endpoints, payloads, auth, errors |

## Decisions baseline (approved 2026-05-17)

- **Stack:** NestJS (TypeScript) backend, React (TypeScript + Vite) frontend, PostgreSQL.
- **Email intake:** IMAP polling of a support mailbox.
- **Auth:** Local email/password, JWT, RBAC roles `CUSTOMER`, `AGENT`, `ADMIN`.
- **Doc scope:** Core set only (SRS, Architecture, Data Model, API). PM/QA/Ops
  docs deferred.

## Status

Draft v0.1 — awaiting review. Development starts after sign-off.
