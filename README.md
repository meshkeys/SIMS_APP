# SIMS — Strategic Initiative Management System

A multi-tenant Strategy Execution Command Centre: translate corporate strategy into
measurable initiatives, monitor execution, surface delays, enforce accountability and
report to Management and the Board.

## Repository layout

```
apps/
  server/     NestJS API · Prisma · PostgreSQL (row-level security)
  client/     React 19 + Vite web app
packages/     shared code (API contracts) — added as the API grows
docker/       init scripts for local infrastructure
```

npm workspaces tie these together; run every command from the repo root.

## Getting started

Requirements: Node 24+, Docker Desktop.

```bash
cp .env.example .env        # local defaults work as-is
npm install                 # installs all workspaces, generates the Prisma client
npm run infra:up            # Postgres (5433), Redis (6379), Mailpit (1025 / UI on 8025)
npm run db:migrate          # applies migrations
npm run dev:server          # API on http://localhost:3000
npm run dev:client          # web app on http://localhost:5173
```

Postgres is published on **5433** so it does not collide with a locally installed
Postgres on 5432.

## Database roles

| Role | Used for | Notes |
|---|---|---|
| `postgres` (`DATABASE_ADMIN_URL`) | migrations, seeding | owns every table |
| `sims_app` (`DATABASE_URL`) | the running API | not the owner, no `BYPASSRLS`, so row-level security always applies |

Both are created by `docker/postgres/init/` the first time the volume is created.
To rebuild from scratch: `docker compose down -v && npm run infra:up && npm run db:migrate`.

## Tenant isolation

1. **API layer:** every query is scoped to the signed-in organisation.
2. **Row-level security:** Postgres policies on `organisationId`.
3. **Composite foreign keys:** child rows reference `[parentId, organisationId]`, so a
   record can never point at another tenant's data, even through a bug.
