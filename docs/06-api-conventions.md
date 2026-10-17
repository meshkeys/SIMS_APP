# 6. API conventions

Every endpoint follows these rules, so clients can rely on one behaviour everywhere.

## 6.1 Paths and versioning

- Base path: `/api/v1/<resource>`. A breaking change ships as `/api/v2` alongside v1.
- `/health` is unversioned and public, for load balancers (`200` healthy, `503` when the
  database is unreachable).

## 6.2 Authentication and roles

- All routes require `Authorization: Bearer <access token>` unless marked `@Public()`.
- `@Roles('CEO', 'BOARD')` allows callers holding **any** listed role.
- Authenticated handlers run inside the caller's tenant context automatically.

## 6.3 Errors — RFC 9457 Problem Details

Every error has content type `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "Some fields are missing or invalid.",
  "errors": [
    { "path": "email", "message": "Enter a valid email address", "code": "invalid_format" },
    { "path": "password", "message": "Use at least 12 characters", "code": "too_small" }
  ],
  "instance": "/api/v1/auth/signup",
  "requestId": "0885b8d7-4c41-40b8-9e71-541f2570877c"
}
```

- **Clients branch on `code`**, never on `detail` (wording may change).
- `errors[]` appears for validation failures, one entry per field (`path` uses dots for
  nesting, e.g. `milestones.2.weight`).
- `500` responses never include internal details; quote the `requestId` to support.

## 6.4 Validation

- Request bodies are validated with zod schemas (`ZodValidationPipe`).
- Unknown properties are stripped; handlers receive typed, normalised data (e.g. emails
  trimmed and lower-cased, country codes upper-cased).

## 6.5 Request tracing

- Every response carries `X-Request-Id`. A safe incoming id (from a load balancer or the
  client) is reused; otherwise one is generated.
- The same id appears in error bodies, server logs and audit events.

## 6.6 Rate limits

| Limit | Default | Variable |
|---|---|---|
| All endpoints, per client IP | 300 / minute | `RATE_LIMIT_PER_MINUTE` |
| Sign-up, sign-in, refresh, per client IP | 10 / minute | `RATE_LIMIT_AUTH_PER_MINUTE` |

Exceeding a limit returns `429 RATE_LIMITED` with `Retry-After` (seconds).

## 6.7 Caching and data formats

- Responses containing tokens send `Cache-Control: no-store`.
- Dates: ISO 8601 strings in UTC (`2026-10-16T09:00:00.000Z`); calendar dates as
  `YYYY-MM-DD`.
- Identifiers: UUID strings.
- Money: decimal values in the organisation's currency (`organisation.currency`).

## 6.8 Conventions for upcoming list endpoints

- Cursor pagination: `?limit=50&cursor=<opaque>`; responses include `nextCursor`.
- Filtering by query parameters named after fields (`?status=ACTIVE&health=RED`).
- Sorting: `?sort=dueDate` / `?sort=-dueDate`.

## 6.9 Interactive API reference

An OpenAPI (Swagger) reference generated from the code will be published at
`/api/docs` in non-production environments as feature modules are added.
