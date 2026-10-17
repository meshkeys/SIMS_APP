# 4. Security and multi-tenancy

## 4.1 Three layers of tenant isolation

| Layer | Mechanism | Protects against |
|---|---|---|
| 1. Application | Every authenticated request runs inside its organisation's tenant context; services use the tenant-scoped client | Ordinary access paths |
| 2. Database (RLS) | PostgreSQL row-level security policies on every tenant table, keyed on `organisationId = sims_current_org()` | A forgotten `where` clause, a bug, an injected query |
| 3. Schema | Composite foreign keys `[parentId, organisationId]` | A row in one tenant referencing another tenant's record |

## 4.2 How row-level security works here

1. The API connects as **`sims_app`**: not the table owner, no superuser, no `BYPASSRLS`.
2. Each operation through `TenantPrismaService` runs in a short transaction that first
   executes `SELECT set_config('app.current_org', '<organisation id>', true)`.
3. Every policy compares the row's `organisationId` with that setting.
4. If the setting is missing, the comparison is NULL and **no rows are returned** — the
   system fails closed.
5. `true` makes the setting local to the transaction, so it never leaks to the next user
   of a pooled connection.

```ts
// Feature code — the organisation is implicit:
this.db.client.initiative.findMany({ where: { status: 'ACTIVE' } });

// Several writes that must succeed or fail together, and any raw SQL:
this.db.transaction(async (tx) => { ... });
```

Both throw `MissingTenantContextError` outside a tenant context rather than ever running
without one.

### Adding a new tenant table

Its migration must call `SELECT sims_enable_tenant_rls('"NewTable"');`. An automated test
fails if any table with an `organisationId` column lacks row-level security.

## 4.3 The single sanctioned cross-tenant path

At sign-in the API knows the person but not yet the organisation. The function
`sims_auth_memberships(user_id)` is `SECURITY DEFINER` with a pinned `search_path`, and
returns **only that user's** memberships with the minimum organisation fields. `sims_app`
may execute it but not change it. In production the migration role must be a superuser
or have `BYPASSRLS` for this function to work.

## 4.4 Data integrity and audit

- **Append-only audit.** `UPDATE`, `DELETE` and `TRUNCATE` on `AuditEvent` are revoked from
  the application role; tested.
- **CHECK constraints** enforce invariants the API must never break (chapter 3).
- **Migration history** (`_prisma_migrations`) is not accessible to the application role.

## 4.5 Authentication and session security (summary)

Detailed in chapter 5.

- Passwords hashed with Argon2id (OWASP parameters). Wrong-password and unknown-email
  responses are identical in content and timing.
- Access tokens: 15-minute JWT (HS256, fixed algorithm, issuer and audience checked,
  claims validated).
- Refresh tokens: random, stored only as SHA-256 hashes, rotated on every use, replay
  revokes the whole sign-in, delivered only in an `httpOnly`, `SameSite=Strict` cookie
  limited to `/api/v1/auth`.
- Secure by default: every route requires authentication unless explicitly `@Public()`.

## 4.6 HTTP hardening

- Security headers via helmet; `X-Powered-By` removed.
- CORS limited to configured origins, with credentials.
- Rate limiting per client IP: 300 requests/minute overall, 10/minute on sign-in, sign-up
  and refresh (both configurable). `429` responses include `Retry-After`.
- Errors never leak internals: unexpected errors return a generic message plus a
  `requestId` that support can trace in the logs.
- `TRUST_PROXY` must be set to the number of proxies in front of the API so client IPs
  (rate limits, audit) are correct.

## 4.7 Roles and permissions

Role checks (`@Roles(...)`) answer "may this kind of user call this endpoint?". Record-level
rules — owner, sponsor, sensitive initiatives, Internal Audit read-only — are enforced in
services as each module is built.

## 4.8 Secrets

| Secret | Where | Notes |
|---|---|---|
| `JWT_ACCESS_SECRET` | Environment | ≥ 32 characters; generate with `openssl rand -base64 48`; different per environment |
| Database passwords | Environment | Separate owner (migrations) and app (runtime) roles |

`.env` files are never committed; `.env.example` documents every variable.
