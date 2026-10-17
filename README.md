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
npm run db:seed             # loads the "Meridian Financial Group" demo tenant (re-runnable)
npm run dev:server          # API on http://localhost:3000
npm run dev:client          # web app on http://localhost:5173
```

Postgres is published on **5433** so it does not collide with a locally installed
Postgres on 5432.

## Demo sign-in

After `npm run db:seed`, every Meridian user signs in with password `Meridian-demo-2026`
(local development only — the seed refuses to run in production). For example:

| Email | Persona |
|---|---|
| `amara.bello@meridian.example` | Head, Strategy Office (Strategy Office + admin) |
| `hassan.danjuma@meridian.example` | Head, Digital Business (initiative owner) |
| `ngozi.eze@meridian.example` | MD/CEO |
| `olumide.adeyemi@meridian.example` | Board Chair |

## API conventions

- Base path `/api/v1`; `/health` is unversioned for load balancers.
- Every route requires a signed-in user unless marked `@Public()`; restrict by role with `@Roles(...)`.
- Errors are RFC 9457 `application/problem+json` with a stable `code` and the `requestId`.
- Sessions: short-lived access token (JSON body, keep in memory) + rotating refresh token
  in an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/v1/auth`.

| Endpoint | |
|---|---|
| `POST /api/v1/auth/signup` | create account + organisation (14-day trial, default rules) |
| `POST /api/v1/auth/login` | sign in (optional `organisationSlug` to pick a workspace) |
| `POST /api/v1/auth/refresh` | rotate the refresh cookie, get a new access token |
| `POST /api/v1/auth/switch-organisation` | open another workspace the user belongs to |
| `POST /api/v1/auth/logout` | revoke the session on every device sharing the sign-in |
| `GET /api/v1/auth/me` | current user, organisation, roles and workspaces |

## Database roles

| Role | Used for | Notes |
|---|---|---|
| `postgres` (`DATABASE_ADMIN_URL`) | migrations, seeding | owns every table |
| `sims_app` (`DATABASE_URL`) | the running API | not the owner, no `BYPASSRLS`, so row-level security always applies |

Both are created by `docker/postgres/init/` the first time the volume is created.

In production the migration role must be a superuser or have `BYPASSRLS`: the sign-in
lookup `sims_auth_memberships()` is a `SECURITY DEFINER` function that runs with its rights.
To rebuild from scratch: `docker compose down -v && npm run infra:up && npm run db:migrate`.

## Server code layout

```
apps/server/src/
  domain/          pure business rules (no NestJS, no database) — rulesets, health, scoring
  modules/         NestJS feature modules: HTTP + persistence per domain
  infrastructure/  database, queues, storage, mail
  config/          validated environment
apps/server/prisma/
  schema.prisma    data model
  migrations/      SQL migrations (including hand-written RLS and constraints)
  seed/            demo data that reproduces the wireframe portfolio
```

Nothing about an organisation's strategy is hard-coded: framework levels and their
names, the number of pillars/objectives/KPIs/initiatives, RAG thresholds, the
escalation ladder (1–10 levels) and the reporting cycle are all per-organisation data.

## Tenant isolation

1. **API layer:** every query is scoped to the signed-in organisation.
2. **Row-level security:** Postgres policies on `organisationId`.
3. **Composite foreign keys:** child rows reference `[parentId, organisationId]`, so a
   record can never point at another tenant's data, even through a bug.

In feature code, inject `TenantPrismaService` and run inside a tenant context:

```ts
// Single operations
this.db.client.initiative.findMany({ where: { status: 'ACTIVE' } });

// Several writes that must succeed or fail together (and any raw SQL)
this.db.transaction(async (tx) => { ... });
```

Both throw outside `TenantContext.run(...)` rather than ever running without a tenant.
Adding a table with `organisationId`? Its migration must call
`SELECT sims_enable_tenant_rls('"TableName"');` — the e2e suite fails otherwise.

## Testing

```bash
npm test -w @sims/server            # unit tests
npm run test:e2e -w @sims/server    # integration tests against the sims_test database
```

e2e tests migrate `sims_test` automatically and refuse to run against any database
whose name does not end in `_test`.
