# 18. Web app

`apps/client` is the SIMS web app: React 19, built with Vite, talking only to the API
through the typed client generated from `@sims/contracts` (ADR-025).

## 18.1 Stack

| Concern | Choice | Why |
|---|---|---|
| Routing | TanStack Router | Type-safe routes and search params (register filters live in the URL) |
| Server data | TanStack Query | Caching, background refresh, retries, loading/error states |
| API calls | `request(operationId, input)` | Path, query, body and result typed from `API_ROUTES` |
| Forms | react-hook-form + zod | Validates with the same schemas the server uses |
| Styling | Tailwind CSS v4 | Design tokens as CSS variables; no runtime cost |
| Accessible primitives | Radix UI | Dialogs, menus, popovers with correct focus and keyboard handling |
| Icons | lucide-react | Consistent stroke icons, tree-shaken |
| Fonts | Inter, JetBrains Mono (self-hosted) | No third-party font requests |
| Tests | Vitest, Testing Library, axe-core | Behaviour as users see it; WCAG checks in every screen test |

## 18.2 Structure

```
src/
  app.tsx, router.tsx     providers, route tree and sign-in guard
  auth/                   session provider and hooks (useAuth, useSession)
  lib/api/                typed client, errors, in-memory token, query hooks
  components/ui/          design system: Button, Card, Badge/HealthBadge, Field, Alert,
                          Meter, PageHeader, Skeleton, EmptyState, ErrorState, Spinner
  components/layout/      app shell (sidebar, mobile drawer, user menu) and navigation
  features/<screen>/      one folder per screen
  styles/index.css        design tokens
```

## 18.3 Design system

Tokens follow the wireframes: a warm off-white canvas, white cards, a near-black sidebar,
**navy** for actions and execution, **ochre** for strategic impact, and soft status tints
(green on track, amber at risk, red delayed, grey unknown). Every text/background pair meets
WCAG AA contrast (checked when the palette was defined). Status is never shown by colour
alone — badges always carry their word ("At risk"). Health labels come from one table
(`lib/health.ts`), so every screen says the same thing.

## 18.4 Sessions and security

- The **access token is kept in memory only**, never in localStorage; the refresh token is an
  httpOnly, SameSite=Strict cookie the page cannot read. A reload restores the session via
  `POST /auth/refresh`.
- An expired access token is renewed **once**, transparently, and the request retried.
  Concurrent failures share one refresh, and refreshes are serialised **across tabs** with
  the Web Locks API — otherwise two tabs refreshing together would look like token theft to
  the server's reuse detection and sign the user out.
- Signing out (or switching workspace) clears all cached data.
- After sign-in, the app returns to the page the user wanted, accepting only same-site paths
  (no open redirects).
- In development, every response is checked against its contract schema and mismatches are
  logged.

In development the Vite server proxies `/api` to the API on port 3000, so the app and the API
share an origin and the refresh cookie works without CORS.

## 18.5 Accessibility

Skip link to the main content; landmarks (`nav`, `main`); `aria-current` on the active page;
labelled form fields with errors linked by `aria-describedby` and announced; visible keyboard
focus everywhere; reduced-motion respected; every page sets the browser tab title. Screen
tests run axe-core and fail on any WCAG 2.1 A/AA violation.

## 18.6 Commands

| Command | Does |
|---|---|
| `npm run dev:client` | App on http://localhost:5173 (start the API too) |
| `npm test -w @sims/client` | Tests |
| `npm run typecheck -w @sims/client` | Type-check |
| `npm run build -w @sims/client` | Production build in `apps/client/dist` |

Screens not yet built show a "being built" placeholder inside the real shell.
