# 2. Architecture

## 2.1 System context

```
   Browser (React web app)          Mobile app (later)
            │  HTTPS, JSON                 │
            ▼                              ▼
   ┌────────────────────────────────────────────────┐
   │  SIMS API  (NestJS, stateless, N instances)    │
   │  /api/v1/...      /health                      │
   └───────┬──────────────┬──────────────┬──────────┘
           │              │              │
           ▼              ▼              ▼
     PostgreSQL 16      Redis 7       Object storage      SMTP
     (data, RLS)     (jobs, rate      (evidence, packs)   (email)
                      limits, cache)    — planned          Mailpit locally
```

Today the API uses PostgreSQL; Redis and Mailpit run locally and are wired in as the
jobs, invitations and notification modules arrive. Object storage is added with the
documents module.

## 2.2 Technology stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) everywhere | One language front to back; shared types |
| API framework | NestJS 12 (Express) | Modular structure, dependency injection, guards/interceptors |
| Database | PostgreSQL 16 | Row-level security, strong constraints, JSON where useful |
| ORM / migrations | Prisma 7 (driver adapter `pg`) | Type-safe queries, reviewable SQL migrations |
| Validation | zod 4 | One schema gives runtime validation and static types; shareable with the web app |
| Auth | JWT (jose) + rotating opaque refresh tokens; Argon2id | See chapter 5 |
| Jobs / queues | BullMQ on Redis (planned) | Recalculation, escalation ladder, reminders, pack generation |
| Web app | React 19 + Vite (planned: TanStack Router/Query, Tailwind, Radix) | |
| Tests | Vitest (unit + end-to-end against a real database) | |
| Monorepo | npm workspaces | `apps/server`, `apps/client`, `packages/*` |

## 2.3 Repository layout

```
strategy_app/
  apps/
    server/                 NestJS API
      prisma/
        schema.prisma       data model
        migrations/         SQL migrations (incl. hand-written RLS & constraints)
        seed/               demo data reproducing the wireframes
      src/
        domain/             pure business rules — no NestJS, no database
        modules/            feature modules (HTTP + persistence per domain)
        infrastructure/     database (tenant-scoped Prisma), later queues/storage/mail
        common/             HTTP conventions: errors, validation, request ids, rate limits
        config/             validated environment
        generated/          Prisma client (generated, not committed)
      test/                 end-to-end tests and helpers
    client/                 React web app
  packages/                 shared code (API contracts) — as needed
  docker/                   local infrastructure init scripts
  docs/                     this documentation
```

### Layering rules (server)

- **`domain/`** holds rules and calculations (rulesets, health, scoring). It imports
  nothing from NestJS or Prisma, so it is fast to test and can be reused by the web app.
- **`modules/<feature>/`** holds controllers (HTTP), services (use cases) and schemas
  (request validation). Services use `TenantPrismaService` for data.
- **`infrastructure/`** wraps external systems. Feature code never creates database
  connections itself.

## 2.4 Request lifecycle

```
request
  → request-id middleware          (X-Request-Id on every response)
  → helmet, CORS, cookie parser
  → ThrottlerGuard                 (rate limits per client IP)
  → AccessTokenGuard               (verifies Bearer token, unless @Public)
  → RolesGuard                     (enforces @Roles, if any)
  → TenantContextInterceptor       (runs the handler inside the caller's organisation)
  → ZodValidationPipe              (validates and types the body)
  → controller → service → TenantPrismaService
                               (every query: set app.current_org; RLS applies)
  → response   |  any error → ProblemDetailsFilter (application/problem+json)
```

## 2.5 Scalability

- **Stateless API.** No session state in memory; any instance can serve any request, so
  capacity scales horizontally behind a load balancer.
- **Cheap authentication.** Access tokens are verified without a database call.
- **Precomputed rollups.** Health, progress and impact scores are stored on initiatives and
  strategy elements and updated by jobs, so dashboards read a few rows instead of
  aggregating the whole portfolio per request.
- **Time-ordered ids (UUIDv7)** keep primary-key indexes compact and inserts append-only.
- **Connection pooling.** Tenant context is set per transaction (`set_config(..., true)`),
  which is safe behind PgBouncer in transaction mode.
- **Planned:** Redis-backed rate limits and caches shared by all instances; read replicas
  for reporting; monthly partitioning of the audit table when volume requires it.
