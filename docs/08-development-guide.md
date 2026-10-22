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
npm run dev:server          # API on http://localhost:3000 (reference: /api/docs)
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
| `npm run dev:client` | Web app on http://localhost:5173 (proxies `/api` to the API) |
| `npm test -w @sims/client` | Web app tests (including accessibility checks) |
| `npm run dev:contracts` | Rebuild `@sims/contracts` on save (while editing API shapes) |
| `npm run db:generate` | Regenerate the Prisma client and the contract enums |
| `npm test -w @sims/server` | Unit tests |
| `npm run test:e2e -w @sims/server` | End-to-end tests against `sims_test` |
| `npm run lint` / `npm run build` | All workspaces |
| `npm run docs:build` | Build this documentation as PDF and HTML |
| `npm run mail:test -- you@example.com` | Send one test email with the SMTP settings in `.env`, explaining any failure |

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
| `API_DOCS` | on, off in production | Serve `/api/openapi.json` and `/api/docs` |
| `APP_URL` | http://localhost:5173 | Web app address, used in email links |
| `SMTP_HOST` / `SMTP_PORT` | localhost / 1025 | Outgoing mail server (Mailpit locally) |
| `SMTP_SECURE` | false | `true` for implicit TLS (port 465); STARTTLS is used when offered |
| `SMTP_USER` / `SMTP_PASSWORD` | — | SMTP credentials, if the provider needs them |
| `MAIL_FROM` | SIMS <no-reply@sims.local> | Sender shown on emails |
| `STORAGE_DRIVER` | local | `local` (a folder) or `s3` (any S3-compatible service), chapter 21.5 |
| `STORAGE_LOCAL_DIR` | var/storage | Folder for the local driver (git-ignored) |
| `S3_BUCKET` / `S3_REGION` / `S3_ENDPOINT` | — / auto / — | Bucket, region and (non-AWS) endpoint for the s3 driver |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | — | Both or neither (then the provider's default credentials) |
| `S3_FORCE_PATH_STYLE` | false | Path-style URLs, for providers that need them |
| `UPLOAD_MAX_MB` | 20 | Largest upload accepted |
| `REDIS_URL` | redis://localhost:6379 | Redis for the background job queue |
| `JOBS_DRIVER` | bullmq | `bullmq` (through Redis, survives restarts) or `inline` (runs at once; tests) |
| `JOBS_WORKER` | true | Process jobs in this server; turn off on API-only instances |
| `CHROME_PATH` | found automatically | Chrome, Chromium or Edge used to print PDF packs |
| `TEST_DATABASE_URL` / `TEST_DATABASE_ADMIN_URL` | — | e2e database (name must end in `_test`) |

Configuration is validated at start-up; the server refuses to boot and lists every problem
if anything is missing or invalid.

## 8.5 Email in development

By default all email goes to **Mailpit**: open http://localhost:8025 to read what the API
sent (welcome and confirmation emails, invitations, password resets). Mailpit catches every
message and **delivers none**, so nothing reaches real inboxes, which is what you want while
developing.

### Sending to real inboxes (Brevo)

1. Create a free Brevo account (https://www.brevo.com; 300 emails a day on the free plan).
2. **Verify a sender**: *Senders, Domains & Dedicated IPs → Senders → Add a sender*, using an
   address you can receive at; confirm the email Brevo sends. For production, also
   authenticate your domain there (it adds DKIM and SPF records), so mail is not marked as
   spam.
3. **Create an SMTP key**: *SMTP & API → SMTP → Generate a new SMTP key*. The same page shows
   your SMTP login.
4. In the root `.env`, replace the mail settings (keep the key out of git; `.env` is ignored):

   ```
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=<your SMTP login>
   SMTP_PASSWORD=<the SMTP key>
   MAIL_FROM=SIMS <the sender you verified>
   APP_URL=http://localhost:5173
   ```

   `APP_URL` is where links in emails point: the web app's public address in production.
5. Check it: `npm run mail:test -- you@example.com`. It sends one email and, if it fails,
   says why: a refused login (wrong login or key), an unreachable server (host, port or a
   firewall blocking outgoing SMTP), or a refused sender (`MAIL_FROM` not verified).
6. Restart the API (`npm run dev:server`) so it reads the new settings.

To go back to Mailpit, restore the `localhost` / `1025` values. Any other SMTP provider
(SendGrid, Mailgun, Postmark, Amazon SES) works the same way with its own host, port and
credentials.

### Running a second API for tests

The web app proxies `/api` to `http://localhost:3000`; set `SIMS_API_URL` to use another API,
e.g. `SIMS_API_URL=http://localhost:3100 npx vite preview --port 4174` with a second API on
port 3100. Use this for browser checks while your own dev servers are running.

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
`packages/contracts/src/<area>.ts` and add the route to `API_ROUTES` (chapter 17);
create/extend a module in
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

**Dependency overrides.** The root `package.json` has an `overrides` entry giving `exceljs`
a patched `uuid` (exceljs 4.4 pins an old version with a security advisory; the
"`npm audit fix --force`" suggestion would *downgrade* exceljs to 2019). Remove the override
once exceljs ships a release with a current `uuid`. `npm audit` should report 0
vulnerabilities.

## 8.9 Git workflow

Small, reviewable slices. Each slice: code + tests + docs updated, all checks green, then
one commit with a conventional message (`feat(auth): …`, `chore: …`, `docs: …`).
