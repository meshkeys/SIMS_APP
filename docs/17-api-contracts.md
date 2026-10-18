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

## 17.4 Next: OpenAPI reference (slice 13b)

The same schemas will generate an OpenAPI 3.1 document served with an interactive reference
page, and tests will fail if a route exists without a contract (or the other way round), or
if a real response does not match its schema.
