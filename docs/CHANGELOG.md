# Changelog

All notable changes, newest first. Dates are when the slice was completed.

## 2026-10-18 — Documentation
- Documentation set in `docs/` with a PDF/HTML build (`npm run docs:build`).

## 2026-10-18 — Authentication (slice 4a)
- Sign-up creating an organisation (trial subscription, founder roles, default ruleset).
- Sign-in, refresh-token rotation with reuse detection, switch workspace, sign-out, `/auth/me`.
- Global guards (rate limit → access token → roles); tenant context per request.
- API conventions: `/api/v1`, Problem Details errors, zod validation, request ids,
  security headers, CORS, rate limits with `Retry-After`.
- `sims_auth_memberships()` sign-in lookup; RefreshToken made user-scoped.
- Demo users can sign in (password `Meridian-demo-2026`).

## 2026-10-17 — Rules, ladder and demo data (slice 3)
- Ruleset configuration schema (RAG, modifiers, overrides, ladder, reporting cycle, impact).
- Configurable escalation ladder (1–10 levels) with named level history.
- Tenant deletion by cascade.
- Meridian demo seed reproducing every wireframe number, with integrity tests.

## 2026-10-17 — Tenant isolation (slice 2)
- Row-level security on every tenant table; append-only audit; ~40 CHECK constraints;
  one active ruleset per organisation.
- Tenant-scoped Prisma client and tenant context; validated environment; `/health`.

## 2026-10-17 — Foundation (slice 1)
- Monorepo (npm workspaces), Docker infrastructure (Postgres, Redis, Mailpit).
- Data model (≈40 tables) with composite tenant keys and UUIDv7 ids; first migration.
