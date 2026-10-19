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
| Department | `departmentId` | From `GET /departments` |
| Health chips: All · Delayed · At risk · On track (· Unknown when any) | `health` | Counts within the current tab; press again to clear |
| Sort: health then due date · due date · latest due · furthest behind · ID | `sort` | |
| Previous / Next, "Page 1 of 4" | `page` | Any other change returns to page 1 |

Each row: ID, initiative (links to its page) with pillar and a "Restricted" mark for
sensitive ones, owner and sponsor, due date (and a later forecast in red), execution bar
with the planned tick and "−9 pp vs plan", health (and "Overridden"), impact summary or
"% of target" or "Not yet measurable", and last update ("overdue" in red). The table scrolls
sideways on narrow screens. Loading shows skeleton rows; no matches offers **Clear filters**.

**Export to Excel** downloads exactly the current view — every page, same filters, order
and visibility (chapter 13.2.1) — with the same sign-in handling as other calls.
**Propose initiative** is shown to the roles allowed to propose; after proposing, the
register opens on the Pipeline tab with a confirmation ("REV-009 · … was submitted to the
Strategy Office for approval").

### Propose initiative (`/initiatives/new`)

One page in four numbered sections, validated with the contract's `createInitiativeSchema`
(the server's own rules), with a "What happens next" panel:

1. **Details** — title, description, business case, scope, priority (1 highest), optional
   code (suggested from the primary objective otherwise), and **Restricted**.
2. **Strategic fit** — one or more objectives (grouped under their pillar) with weights;
   one is marked **primary** (it decides the pillar and the suggested code).
3. **People** — owner (empty = the proposer, unless Strategy Office), executive sponsor
   (only people with that role are offered), benefits owner, department.
4. **Baseline and budget** — start, end and budget in the organisation's currency; locked
   at activation, changed afterwards only through a change request.

**Save draft** or **Submit proposal**. Blank optional fields are sent as "not given",
never as empty text. Errors from the server land on their fields (e.g. a code already
taken appears under Code).

**People picker** (`components/ui/people-picker.tsx`): type to search the directory
(`GET /members`) by name, email or job title; choose with mouse or keyboard (↑ ↓ Enter,
Esc); shows job title and department; can be limited to a role; clearable. Built on
Downshift's accessible combobox, and reused wherever someone is assigned.

### Initiative detail (`/initiatives/:id`)

From `GET /initiatives/:id` (chapter 13.3). The open tab is in the URL (`?tab=risks`).

- **Header:** breadcrumb, title, chips (health — "· overridden" when an override applies;
  status instead of health before activation; priority; pillar; "Contributes to O2.1 ·
  O1.1"; Restricted), and **Change status** with the moves the server allows the caller.
- **Facts:** owner, sponsor, benefits owner (job titles; names on hover), baseline dates,
  budget ("₦500m · 58% spent"), last verified update; a later forecast end is flagged.
- **Notices:** update overdue, awaiting approval, approved and ready to plan, on hold,
  closed or cancelled.
- **Overview:** execution (verified vs planned with the tick, pp behind) and strategic impact
  cards; **Why this status?** — each rule's result, the calculated result and the
  management override (who, when, expiry), with **Override** / **Remove override** for
  those allowed; the milestones table (weight, baseline, forecast/actual, verified,
  contribution, evidence; total row); the **planned vs actual** chart; risks and issues;
  dependencies (blocked by / enables, linked); activity and audit trail.
- **Tabs:** Milestones & tasks · Risks & issues · Dependencies · Change requests.
- **Actions:** lifecycle moves in a confirmation dialog that says what will happen;
  stopping or pausing delivery needs a reason; refusals (e.g. not ready to activate) are
  explained in the dialog. Health override with reason and optional expiry (default: the
  longest the organisation allows). Results update the page at once and refresh lists.

The chart is drawn as SVG with a written summary ("verified progress was 60% against 66%
planned") and the figures as a table for screen readers. A restricted initiative the
person may not see shows "This initiative cannot be shown" — the same as one that does not
exist.

**Editing** — every control appears only if the server's `can` says it will work:

- **Edit details** shows just the fields this person may change now (an owner sees the
  narrative, forecast end and spend; the sponsor also title, priority, department and
  benefits owner; the Strategy Office also owner, sponsor and Restricted; baseline dates and
  budget only before activation). Only fields actually changed are sent; the people pickers
  show the current assignee before any search.
- **Change** next to "Contributes to" (Strategy Office) relinks objectives and weights with
  the same editor as the propose page.
- **Milestones:** **Add milestone**, **Edit** and **Remove** while the plan is open; after
  activation only the title and forecast date can change here (the rest needs a change
  request).
- **Tasks** (Milestones & tasks tab): add with assignee and due date, change status in
  place (To do · In progress · Done · Blocked), remove.

Dependencies, **Request change** and withdrawing a request follow in slice 19c;
**Documents**, **Updates** and **Escalate** arrive with their backend slices.

