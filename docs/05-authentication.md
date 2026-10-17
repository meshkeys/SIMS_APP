# 5. Authentication

## 5.1 Endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/v1/auth/signup` | public, strict rate limit | Create a person + organisation (14-day trial, default rules), sign in |
| `POST /api/v1/auth/login` | public, strict rate limit | Sign in; optional `organisationSlug` chooses the workspace |
| `POST /api/v1/auth/refresh` | refresh cookie, strict rate limit | Rotate the refresh token; new access token |
| `POST /api/v1/auth/switch-organisation` | access token + cookie | Open another workspace the user belongs to |
| `POST /api/v1/auth/logout` | refresh cookie | Revoke the sign-in on every device sharing it |
| `GET /api/v1/auth/me` | access token | Current user, organisation, roles, workspaces |

Sign-in responses share one shape:

```json
{
  "accessToken": "eyJhbGciOi…",
  "accessTokenExpiresAt": "2026-10-18T10:15:00.000Z",
  "session": {
    "user": { "id": "…", "name": "Amara Bello", "email": "amara.bello@meridian.example" },
    "organisation": { "id": "…", "name": "Meridian Financial Group", "slug": "meridian",
                      "status": "ACTIVE", "currency": "NGN", "timezone": "Africa/Lagos",
                      "terminology": { "kpi": "KPI", "initiative": "Initiative" }, "onboardingStep": 5 },
    "membership": { "id": "…", "roles": ["STRATEGY_OFFICE", "SYSTEM_ADMIN"], "jobTitle": "Head, Strategy Office" },
    "organisations": [ { "id": "…", "name": "Meridian Financial Group", "slug": "meridian", "roles": ["…"] } ]
  }
}
```

The refresh token is **never** in the body — only in the `sims_rt` cookie.

## 5.2 Token design

| | Access token | Refresh token |
|---|---|---|
| Format | JWT, HS256 | 32 random bytes (base64url), opaque |
| Lifetime | 15 minutes (`ACCESS_TOKEN_TTL_SECONDS`) | 30 days (`REFRESH_TOKEN_TTL_DAYS`) |
| Where the client keeps it | In memory (not localStorage) | `httpOnly`, `Secure` (production), `SameSite=Strict` cookie, path `/api/v1/auth` |
| Stored server-side | No (stateless) | SHA-256 hash only |
| Sent with | `Authorization: Bearer …` on API calls | Automatically by the browser to auth endpoints only |
| Claims / data | `sub` user, `org` organisation, `mid` membership, `sid` session, `roles` | user, session family, active workspace, expiry, device info |

**Why this split:** verifying access tokens needs no database call (cheap at scale), and
their short life bounds how long a role change or deactivation can lag. The refresh token
is unreadable by page scripts, so an XSS bug cannot steal a long-lived credential.

## 5.3 Flows

### Sign-up
1. Validate input; refuse an email that already has an account (`EMAIL_TAKEN`).
2. Generate ids; make the **new organisation the tenant context**; in one transaction create
   the user, organisation (`ONBOARDING`), trial subscription, founder membership
   (`SYSTEM_ADMIN`, `STRATEGY_OFFICE`), default ruleset v1 and an audit event.
3. Workspace address (slug) is derived from the name if not given; if taken, a short suffix is
   added. A *chosen* address that is taken returns `SLUG_TAKEN`.
4. Start a session.

### Sign-in
1. Look up the user; verify the password (or spend equal time if the user does not exist).
2. Load the user's memberships through `sims_auth_memberships`; keep usable ones (membership
   `ACTIVE`, organisation `ACTIVE` or `ONBOARDING`).
3. Choose the requested workspace, or the first one.
4. Record `USER_SIGNED_IN` in that organisation's audit trail; start a session.

### Refresh (rotation with reuse detection)
```
client ──cookie(T1)──▶ API: T1 valid & unused?
                         ├─ yes → mark T1 used (replacedBy T2), issue T2 + new access token
                         ├─ T1 already used > 30 s ago → token was copied:
                         │      revoke the whole family (every device of that sign-in) → 401
                         └─ T1 used < 30 s ago → benign race (two tabs) → 401, family kept
```
The membership is re-checked on every refresh; a deactivated member is signed out
(`MEMBERSHIP_INACTIVE`) and the cookie is cleared.

## 5.4 Error codes

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Body invalid; `errors[]` lists each field |
| `UNAUTHENTICATED` | 401 | No bearer token on a protected route |
| `INVALID_TOKEN` / `TOKEN_EXPIRED` | 401 | Bad or expired access token (refresh on `TOKEN_EXPIRED`) |
| `INVALID_CREDENTIALS` | 401 | Email or password incorrect |
| `INVALID_REFRESH_TOKEN` / `REFRESH_TOKEN_EXPIRED` / `REFRESH_TOKEN_REUSED` | 401 | Sign in again |
| `MEMBERSHIP_INACTIVE` | 401 | Access to the workspace has ended |
| `NO_ACTIVE_MEMBERSHIP` | 403 | No access to the requested workspace |
| `INSUFFICIENT_ROLE` | 403 | Role required by the route is missing |
| `EMAIL_TAKEN` / `SLUG_TAKEN` | 409 | Sign-up conflicts |
| `RATE_LIMITED` | 429 | Too many attempts; see `Retry-After` |

## 5.5 Client guidance (for the web app)

- Keep the access token in memory. On page load, call `POST /auth/refresh` to restore the
  session from the cookie.
- On `401 TOKEN_EXPIRED`, refresh once and retry the request. Serialise refreshes (one in
  flight at a time).
- Send requests with `credentials: 'include'` so the cookie reaches auth endpoints.

## 5.6 Coming next

Invitations (admin invites by email with roles; invitee accepts by setting a password or
linking an existing account), password reset, email verification, and SSO (Microsoft Entra
ID / Google Workspace via OpenID Connect).
