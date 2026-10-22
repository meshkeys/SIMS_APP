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
| `POST /api/v1/auth/verify-email` | public, strict rate limit | Confirm an email address with the emailed link |
| `POST /api/v1/auth/verify-email/resend` | access token, strict rate limit | Send the confirmation link again |
| `POST /api/v1/auth/password-reset/request` | public, strict rate limit | Email a link to choose a new password (always `204`) |
| `POST /api/v1/auth/password-reset/check` | public, strict rate limit | Whether a reset link still works, and for which email |
| `POST /api/v1/auth/password-reset/complete` | public, strict rate limit | Set a new password with the link; signs out everywhere |

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

### Confirming an email address

1. **Sign-up** sends a welcome email (without holding up the answer; a mail failure never
   fails sign-up) with a one-time link, `APP_URL/verify-email?token=…`, valid for **7 days**.
   Only the SHA-256 hash is stored (`EmailVerificationToken`).
2. The session carries `user.emailVerified`; until it is true the web app shows a reminder
   with **Send the link again** (`/auth/verify-email/resend`: at most one link a minute,
   `429` otherwise; a new link replaces earlier ones; `409 ALREADY_VERIFIED` once confirmed).
3. **Opening the link** confirms the address, signed in or not. Opening it again, or a link
   for an address already confirmed, answers `200` too. Unknown or replaced links answer
   `404 VERIFY_LINK_INVALID`, old ones `410 VERIFY_LINK_EXPIRED`.
4. Accepting an invitation and resetting a password also confirm the address, since the link
   went to it. Unconfirmed accounts work normally; nothing is blocked.

### Forgot password

1. **Request** (`{ email }`). Always `204`, whether or not the email has an account, so the
   form cannot reveal who uses SIMS; the email goes out after the answer, so timing does not
   tell either. Nothing is sent for an unknown email or an account that signs in only with
   single sign-on. At most one link per account per minute (on top of the per-IP limit).
2. A random 256-bit secret is emailed as `APP_URL/reset-password?token=…`; only its
   SHA-256 hash is stored (`PasswordResetToken`). The link works **once**, for **60
   minutes**; asking again deletes earlier unused links.
3. **Check** (`{ token }`) returns the account's email and the expiry, for the "choose a new
   password" page.
4. **Complete** (`{ token, password }`): the password must meet the sign-up rules (12+
   characters). In one transaction the link is claimed (a second use fails), the password
   hash replaced, the email marked verified (the link proves it), other unused links deleted
   and **every refresh token of the account revoked**, so every device is signed out; an
   access token already issued lapses within its 15 minutes. A "your password was changed"
   email follows. The person then signs in with the new password.

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
| `VERIFY_LINK_INVALID` | 404 | Unknown or replaced email confirmation link |
| `VERIFY_LINK_EXPIRED` | 410 | Send a new confirmation link |
| `ALREADY_VERIFIED` | 409 | The email address is already confirmed |
| `RESET_LINK_INVALID` | 404 | Unknown or replaced password reset link |
| `RESET_LINK_USED` / `RESET_LINK_EXPIRED` | 410 | Ask for a new password reset link |
| `RATE_LIMITED` | 429 | Too many attempts; see `Retry-After` |

## 5.5 Client guidance (for the web app)

- Keep the access token in memory. On page load, call `POST /auth/refresh` to restore the
  session from the cookie.
- On `401 TOKEN_EXPIRED`, refresh once and retry the request. Serialise refreshes (one in
  flight at a time).
- Send requests with `credentials: 'include'` so the cookie reaches auth endpoints.

## 5.6 Invitations

People join an organisation by invitation.

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/v1/invitations` | System Admin or Strategy Office | Invite by email with roles (optional job title, department) |
| `GET /api/v1/invitations` | System Admin or Strategy Office | Recent invitations, newest first, with status (`PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`) |
| `POST /api/v1/invitations/:id/resend` | System Admin or Strategy Office | New link, new 7-day expiry; the old link stops working |
| `DELETE /api/v1/invitations/:id` | System Admin or Strategy Office | Revoke |
| `POST /api/v1/invitations/lookup` | public, strict rate limit | What the accept page shows; `accountExists` tells it which form to display |
| `POST /api/v1/invitations/accept` | public, strict rate limit | Join and sign in (same response as sign-in) |

**Rules**

- The link contains a 256-bit one-time token; only its SHA-256 hash is stored. Tokens are
  sent in request bodies, never URLs, so they stay out of access logs. Links expire after
  7 days and work once (claimed atomically).
- Re-inviting an address replaces its pending invitation.
- Only a System Admin can grant `SYSTEM_ADMIN` (`CANNOT_GRANT_ROLE`), preventing privilege
  escalation by other inviters.
- Seat limit: active members plus pending invitations may not exceed the subscription's
  seats (`SEAT_LIMIT_REACHED`). Invitations per organisation are serialised so two admins
  cannot both take the last seat.
- Existing members cannot be invited again (`ALREADY_MEMBER`); a deactivated member who
  accepts a new invitation is reactivated with the invited roles.
- **New person:** gives a name and a new password (strength rules apply).
  **Existing SIMS user** (e.g. a consultant in another organisation): gives their existing
  password, proving ownership; the workspace is added to their account.
- Accepting proves control of the email address, so it is marked verified.
- The email is sent after the invitation is saved. If sending fails, the invitation is kept
  and the response says `emailDelivered: false`; use *resend*. (Sending moves to a retrying
  background job with the jobs module.)

**Error codes:** `INVITATION_NOT_FOUND` (404); `INVITATION_USED`, `INVITATION_EXPIRED`,
`INVITATION_UNAVAILABLE` (410); `INVITATION_CLOSED`, `ALREADY_MEMBER`, `SEAT_LIMIT_REACHED`,
`PASSWORD_SIGNIN_UNAVAILABLE` (409); `CANNOT_GRANT_ROLE` (403).

**Web app:** the emailed link is `APP_URL/accept-invitation?token=…`. The page should read
the token, remove it from the address bar (`history.replaceState`), call `lookup`, then
`accept`.

## 5.7 Coming next

Changing your password while signed in, SSO (Microsoft Entra ID / Google
Workspace via OpenID Connect), and a non-cookie refresh path for the mobile app.
