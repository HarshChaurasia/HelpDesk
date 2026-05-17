# Help Desk Ticketing System

Monorepo: NestJS API + React (Vite) SPA + PostgreSQL.

## Structure
```
backend/   NestJS + Prisma API and background workers
frontend/  React + TypeScript + Vite SPA
docs/      SDLC documentation (SRS, Architecture, Data Model, API)
docker-compose.yml
```

## Quick start (dev)

```bash
cp backend/.env.example backend/.env      # adjust secrets/IMAP/SMTP
docker compose up -d db mailhog
cd backend && npm install
npx prisma migrate dev --name init
npm run seed
npm run start:dev                          # API on :3000, worker cron in-process

cd ../frontend && npm install
npm run dev                                # SPA on :5173
```

Default seeded logins (dev only):

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@helpdesk.local | Passw0rd! |
| Agent | agent1@helpdesk.local | Passw0rd! |
| Customer | customer1@helpdesk.local | Passw0rd! |

See [docs/](docs/00-README.md) for full specifications.

<img width="1916" height="901" alt="image" src="https://github.com/user-attachments/assets/e5969f3c-0141-4ebb-b2d4-47df60112d8b" />

<img width="1796" height="955" alt="image" src="https://github.com/user-attachments/assets/4f762bb6-dfdb-4154-9c1c-25e836e254d6" />


