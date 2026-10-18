# 17. API contracts (`@sims/contracts`)

One package, `packages/contracts`, describes every request and response of the API as a
**zod schema** with its **TypeScript type** (ADR-023). The server validates requests with
these schemas and its services must return exactly these shapes; the web app uses the same
schemas for its forms and the same types for the data it receives. A change to the API is a
change to this package, and the compiler shows every place on both sides that must follow.

## 17.1 What is in it

| File | Contents |
|---|---|
| `enums.ts` | Every database enum (`Health`, `Role`, `InitiativeStatus`…). **Generated** from the Prisma schema — never edit by hand. |
| `common.ts` | Ids, dates (`isoDate` = `2026-12-31`, `isoDateTime` = UTC instant), person/element/initiative references, paging fields, Problem Details errors |
| `auth.ts`, `invitations.ts` | Sign-up, sign-in, session; invitations and acceptance |
| `strategy.ts`, `kpis.ts` | Plans, levels, elements, strategy map; KPIs and targets |
| `delivery.ts` | Register, initiative detail, writes (initiatives, milestones, tasks, dependencies, overrides) |
| `reporting.ts` | Periods, updates (form, queue, my updates) |
| `governance.ts` | Risks and issues, decisions, change requests |
| `dashboard.ts` | The Command Centre |
| `roles.ts` | Role labels and role lists (who may invite, edit strategy, propose initiatives) |
| `routes.ts` | Every endpoint (`API_ROUTES`) |
| `openapi.ts` | The OpenAPI 3.1 generator |

Naming: `xxxSchema` is the zod schema; the type has the same name without `Schema`
(`initiativeDetailSchema` → `InitiativeDetail`). Request types are the schema's **output**
(after defaults and trimming), e.g. `CreateInitiativeInput`.

## 17.2 Rules

- **Plain data only.** Contracts import nothing but zod: no NestJS, no Prisma, no Node APIs,
  so they run unchanged in the browser.
- **Dates on the wire** are strings: `isoDate` for calendar dates (deadlines, baselines),
  `isoDateTime` for instants (`savedAt`, `decidedAt`). Money and percentages are numbers.
- **Server types follow the contract.** Services declare their return types with the
  contract type, so a field the contract promises but the service forgets — or a wrong
  enum — is a compile error, not a production bug.
- **Domain stays independent.** `apps/server/src/domain` keeps its own types (e.g.
  `HealthReason`); where they reach the API, the compiler checks they fit the contract.
- **Enums are generated.** `npm run db:generate` (and `npm install`) copies the Prisma enums
  into `enums.ts`; a unit test fails if the two ever differ.

## 17.3 Working with it

| Task | How |
|---|---|
| Use in the server | `import { createRiskSchema, type RiskView } from '@sims/contracts'` |
| Use in the web app | Same import; forms validate with the same schema the server uses |
| Change a shape | Edit the schema in `packages/contracts/src`, then fix what the compiler reports in server and client |
| Add an enum value | Change `schema.prisma`, migrate, `npm run db:generate` |
| Rebuild | Automatic before server build, start and tests; `npm run dev:contracts` rebuilds on save while you edit contracts |

The package compiles to `packages/contracts/dist` (ignored by git); `npm install` builds it
once through the root `prepare` script.

## 17.4 Route registry

`routes.ts` lists **every endpoint** as `API_ROUTES`, keyed by operation id (`getDashboard`,
`submitUpdate`…): method, path, tag, summary, who may call it (`public`, `member` or a role
list such as `STRATEGY_EDITOR_ROLES`), whether the strict rate limit applies, the query and
body schemas, the success status and the response schema. Role lists and their labels live in
`roles.ts`, so the web app shows and hides actions with the same lists the server enforces.

## 17.5 OpenAPI reference

`buildOpenApiDocument()` turns the registry into an **OpenAPI 3.1** document: named
response shapes become components (`InitiativeDetail`, `RiskRegister`…), requests are
described as the client sends them (defaults optional), and every operation lists who may
call it and the Problem Details error response.

| URL | What |
|---|---|
| `/api/openapi.json` | The document — import it into Postman, Insomnia or a code generator |
| `/api/docs` | Interactive reference (Scalar) |

Both are on by default in development and test, and **off in production** unless
`API_DOCS=true` (the API's shape is not secret, but there is no reason to advertise it).
The reference page is the only page allowed to load a script from a CDN: Scalar is pinned to
an exact version with a Subresource Integrity hash, under a page-specific Content Security
Policy with a per-request nonce (ADR-024).

## 17.6 Drift tests

Three checks keep the contract and the server identical; each fails the e2e suite:

1. **Every route is described, and only those.** The test reads Nest's own route metadata
   and compares method and path with `API_ROUTES` in both directions.
2. **Every route matches its description:** public or not, required roles, success status,
   strict rate limit, and that the controller validates with **the very same** body and query
   schema objects.
3. **Every real response matches its schema.** In the e2e suites an interceptor checks each
   successful response — as it goes over the wire — against the route's response schema, and
   fails the test file on any mismatch (or on an `/api/v1` route with no contract).

The generated document is also validated against the OpenAPI 3.1 specification.

**Adding an endpoint** therefore means: schemas in the contract, an entry in `API_ROUTES`
(named response shapes also in `apiComponents`), then the controller. The tests say what is
missing.
