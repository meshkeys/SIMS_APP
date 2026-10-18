# 8. Development guide

## 8.1 Prerequisites

- Node.js 24+, npm 11+
- Docker Desktop
- Git

## 8.2 First run

```bash
cp .env.example .env        # then set JWT_ACCESS_SECRET (openssl rand -base64 48)
npm install                 # all workspaces; generates the Prisma client, builds @sims/contracts
npm run infra:up            # Postgres :5433, Redis :6379, Mailpit :1025 (UI :8025)
npm run db:migrate          # apply migrations
npm run db:seed             # demo organisation (re-runnable)
npm run dev:server          # API on http://localhost:3000
npm run dev:client          # web app on http://localhost:5173
```

Postgres is published on **5433** so it never collides with a locally installed Postgres.

## 8.3 Commands

| Command (from repo root) | Does |
|---|---|
| `npm run infra:up` / `infra:down` / `infra:logs` | Local Docker services |
| `npm run db:migrate` | Create/apply migrations (development) |
| `npm run db:seed` | Load the Meridian demo tenant |
| `npm run db:studio` | Browse data in Prisma Studio (as the owner role) |
| `npm run dev:server` | API with hot reload |
| `npm run dev:contracts` | Rebuild `@sims/contracts` on save (while editing API shapes) |
| `npm run db:generate` | Regenerate the Prisma client and the contract enums |
| `npm test -w @sims/server` | Unit tests |
| `npm run test:e2e -w @sims/server` | End-to-end tests against `sims_test` |
| `npm run lint` / `npm run build` | All workspaces |
| `npm run docs:build` | Build this documentation as PDF and HTML |

## 8.4 Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | development | development / test / production |
| `PORT` | 3000 | API port |
| `DATABASE_URL` | — | Runtime connection as `sims_app` (RLS applies) |
| `DATABASE_ADMIN_URL` | — | Owner connection for migrations and seeding |
| `DATABASE_POOL_MAX` | 10 | Connections per API instance |
| `JWT_ACCESS_SECRET` | — | ≥ 32 characters |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | 30 | Refresh token lifetime |
| `COOKIE_SECURE` | true in production | HTTPS-only refresh cookie |
| `CORS_ORIGINS` | http://localhost:5173 | Comma-separated allowed browser origins |
| `TRUST_PROXY` | 0 | Number of proxies in front of the API |
| `RATE_LIMIT_PER_MINUTE` | 300 | General limit per IP |
| `RATE_LIMIT_AUTH_PER_MINUTE` | 10 | Sign-in/up/refresh limit per IP |
| `APP_URL` | http://localhost:5173 | Web app address, used in email links |
| `SMTP_HOST` / `SMTP_PORT` | localhost / 1025 | Outgoing mail server (Mailpit locally) |
| `SMTP_SECURE` | false | `true` for implicit TLS (port 465); STARTTLS is used when offered |
| `SMTP_USER` / `SMTP_PASSWORD` | — | SMTP credentials, if the provider needs them |
| `MAIL_FROM` | SIMS <no-reply@sims.local> | Sender shown on emails |
| `TEST_DATABASE_URL` / `TEST_DATABASE_ADMIN_URL` | — | e2e database (name must end in `_test`) |

Configuration is validated at start-up; the server refuses to boot and lists every problem
if anything is missing or invalid.

## 8.5 Email in development

All email goes to **Mailpit**: open http://localhost:8025 to read what the API sent
(invitations, later notifications). Nothing leaves your machine.

## 8.6 Testing strategy

| Level | Where | Covers |
|---|---|---|
| Unit | `src/**/*.spec.ts` | Pure rules (rulesets, tokens, guards, validation) — fast, no database |
| End-to-end | `test/**/*.e2e-spec.ts` | The real app (same `configureApp` as production) against a migrated test database, as the real app role |

Notable suites: tenant isolation (RLS, composite keys, append-only audit, catalog guards);
authentication flows; invitations (a fake mailer captures the emailed link); real SMTP
delivery through Mailpit (skipped if Mailpit is not running); demo seed integrity (pins
every number shown in the wireframes).

## 8.7 How-to

**Add an endpoint.** Define the request and response schemas in
`packages/contracts/src/<area>.ts` (chapter 17); create/extend a module in
`src/modules/<feature>/`; use `@Body(new ZodValidationPipe(schema))` and type the service's
return with the contract type; use `TenantPrismaService`; add `@Roles(...)` where needed;
throw Nest exceptions with a `code`; add e2e tests.

**Add a tenant table.** Add the model with `organisationId` and composite relations to its
parent; create the migration; append `SELECT sims_enable_tenant_rls('"Table"');`; run the
e2e suite (the catalog guard checks it).

**Change the schema.** Edit `schema.prisma`; `npm run db:migrate`; hand-write SQL for RLS,
CHECK constraints or renames (Prisma would drop and re-add a renamed column); confirm
no drift with `prisma migrate diff`.

## 8.8 Code conventions

- TypeScript strict; ESM (`.js` extensions in imports).
- Business rules in `src/domain/` (no framework imports).
- Error responses always carry a stable `code`.
- Comments explain *why*, not *what*.
- Prettier formatting; oxlint for linting.

## 8.9 Git workflow

Small, reviewable slices. Each slice: code + tests + docs updated, all checks green, then
one commit with a conventional message (`feat(auth): …`, `chore: …`, `docs: …`).
