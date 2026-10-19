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

## 18.7 Screens

Each screen lives in `features/<screen>/` and loads on demand (its own small bundle).
Formatting is shared (`lib/format.ts`): calendar dates are shown as written; deadlines and
timestamps in the **organisation's** time zone, so everyone sees the same deadline.

### Command Centre (`/`)

One call to `GET /dashboard` (chapter 16) feeds every panel:

| Panel | Shows | Goes to |
|---|---|---|
| Cycle tracker | Each stage done / in progress / upcoming, its deadline and count ("29 of 32 in") | — |
| Headline tiles | Active, on track (% of portfolio), at risk, delayed, unknown (only when any), updates outstanding | Register filtered by health; My updates |
| Pillar performance | Execution (navy) and strategic impact (ochre) per pillar; "not measured yet" when there is no figure | Click a pillar to narrow the dashboard to it |
| Delivery vs value | The four quadrants with counts; expandable list of initiatives per quadrant | Benefits view |
| Initiative monitoring | Worst five initiatives: health, verified progress with the planned mark | Register |
| Decisions required | Most urgent three, due/overdue; **Review** opens a dialog to approve, reject (with reason) or defer (with a date) — only for the person who must decide | — |
| Escalations | Highest-level first, with the organisation's own ladder names and counts per level | Escalation centre |
| Milestones · next 14 days | Due date, initiative, critical, slip; overdue count | — |

Below the watchlist a legend explains the bars (verified weighted completion; the tick is
planned completion today). The sidebar shows the reporting cycle on every screen ("Day 6 of
8 · Sponsor review", with a progress bar).

**View** narrows everything to one pillar; it is kept in the URL (`/?elementId=…`), so a
scoped dashboard can be bookmarked or shared. Loading shows a skeleton of the layout;
failures explain themselves and offer **Try again** (server errors are retried twice
automatically first); every panel has an empty state.

### Strategy map (`/strategy`)

"From strategy to execution", from `GET /plans/current/map` and `GET /elements/:id`:

- **Header:** plan name, version and approval date; the chain of the organisation's own
  framework levels ("Pillar → Objective → KPI → initiative" — whatever the levels are called).
- **Aspiration banner:** the plan's aspiration (or vision) and totals for every level, KPIs
  and active initiatives.
- **Map:** one card per top-level element with its sponsor and execution bar, holding its
  children (e.g. objectives) with code, headline KPI ("Non-interest income: 18% → 30%"),
  initiative count and health in words (healthy · watch · off track · not yet measured).
  Deeper levels are counted on the card and listed in the detail panel.
- **Detail panel:** selecting an element opens it below — owner, KPI table (baseline, target
  with its label, latest actual, progress to target), contributing initiatives (primary or
  contributor, weight, health), restricted initiatives counted but not listed, and the
  elements below it. The selection is in the URL (`/strategy?element=…`).
- **Add** (Strategy Office and administrators): a dialog to add an element under any element
  that has a level below it, or a new top-level one; the code is suggested by the server.

KPI values are written with their units the way people say them (`lib/format.ts`):
18 `%` → "18%", 72 `h` → "72h", 4.2 `NGN bn` → "₦4.2bn", 40 `clients` → "40 clients".

### Initiative register (`/initiatives`)

From `GET /initiatives` (chapter 13). Every filter is in the URL, so a view can be
bookmarked or shared, and the dashboard's tiles open it pre-filtered
(`/initiatives?health=RED`). Broken values in an edited link fall back to defaults.

| Control | URL | Notes |
|---|---|---|
| Tabs: Active · Pipeline (awaiting approval) · Closed (benefits tracking) · Cancelled | `tab` | With counts; switching tab clears the health filter |
| Search by name, ID or owner | `q` | Applied after a 300 ms pause; replaces the history entry instead of adding one per keystroke |
| Pillar (the plan's own top-level label) | `elementId` | Includes everything under the pillar |
| Health chips: All · Delayed · At risk · On track (· Unknown when any) | `health` | Counts within the current tab; press again to clear |
| Sort: health then due date · due date · latest due · furthest behind · ID | `sort` | |
| Previous / Next, "Page 1 of 4" | `page` | Any other change returns to page 1 |

Each row: ID, initiative (links to its page) with pillar and a "Restricted" mark for
sensitive ones, owner and sponsor, due date (and a later forecast in red), execution bar
with the planned tick and "−9 pp vs plan", health (and "Overridden"), impact summary or
"% of target" or "Not yet measurable", and last update ("overdue" in red). The table scrolls
sideways on narrow screens. Loading shows skeleton rows; no matches offers **Clear filters**.

Not yet on the register (they need endpoints from later slices): the **department** filter
(needs a departments list), **Propose initiative** (needs a people picker for owner and
sponsor) and **Export to Excel** (reports slice).

