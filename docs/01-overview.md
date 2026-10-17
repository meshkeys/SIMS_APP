# 1. Product overview

## 1.1 What SIMS is

SIMS (Strategic Initiative Management System) is a multi-tenant software-as-a-service
platform that helps organisations turn their corporate strategy into measurable
initiatives, monitor execution, surface delays early, enforce accountability, and report
progress to Management and the Board.

It is designed as a **Strategy Execution Command Centre**, not a project tracker. Two
independent lenses run through the whole product:

| Lens | Question it answers | Measured by |
|---|---|---|
| **Execution** | Are we delivering what we said we would, on time? | Verified, weighted milestone completion vs. plan; RAG health |
| **Strategic impact** | Is the delivered work creating the value it promised? | KPIs against baseline and target; realised vs. expected benefits |

An initiative can be on plan and still fail to create value ("delivered, but not creating
value") — surfacing that gap is a core purpose of the product.

## 1.2 Who uses it

| Role | Typical person | What they do in SIMS |
|---|---|---|
| Board | Board members | Read Board packs; decide items escalated to the Board |
| CEO | MD/CEO | Command Centre; decides L3 escalations and change requests |
| Strategy Office | Head of Strategy, analysts | Own the plan, run the reporting cycle, verify and challenge updates, build packs |
| Executive Sponsor | Executive Directors, COO | Sponsor pillars and initiatives; confirm status; approve overrides |
| Initiative Owner | Heads of department | Submit monthly updates with evidence; manage milestones, risks |
| Task Owner | Delivery staff | Update tasks and upload evidence |
| System Admin | Administrator | Configure the organisation, users, rules |
| Internal Audit | Auditors | Read-only access to everything, including the audit trail |

A person can hold several roles and belong to several organisations (for example a
consultant, a group company, or a director sitting on several boards).

## 1.3 Screens (from the wireframes)

| # | Screen | Purpose |
|---|---|---|
| 1 | Dashboard — Strategy Execution Command Centre | Portfolio health, pillar performance (both lenses), delivery-vs-value matrix, decisions, escalations, upcoming milestones, reporting-cycle status |
| 2 | Strategy map | Pillar → objective → KPI → initiative; select an objective to see what delivers it |
| 3 | Initiative register | Searchable, filterable portfolio list with execution, health and impact |
| 4 | Initiative detail | Milestones, "why this status?", override, risks, dependencies, planned-vs-actual chart, audit trail |
| 5 | KPIs & benefits realisation | Expected vs realised benefits, "delivered but not creating value", KPI scorecard |
| 6 | Escalation centre | Escalation ladder, risk heatmap, open escalations, blocked dependencies, decision log |
| 7 | My updates | Monthly progress submission with evidence, commentary and checks |
| 8 | Board pack builder | Templates, snapshot and audience, sections, PDF/PowerPoint/Excel output |
| 9 | Administration | Rules (RAG thresholds, health modifiers, overrides), users, cycles, audit log |
| 10 | Workspace set-up (onboarding) | Organisation, strategy framework and terminology, vision, governance defaults, invite team |

## 1.4 Key principles

1. **Configurable, never hard-coded.** The strategy framework (levels and their names), the
   number of pillars/objectives/KPIs/initiatives, terminology, custom fields, RAG
   thresholds, the escalation ladder and the reporting cycle are all per-organisation data.
2. **Evidence over claims.** Owners *claim* progress; the Strategy Office *verifies* it.
   Only verified progress drives health and reporting.
3. **Auditable.** Baselines, submitted updates, locked snapshots and audit events are never
   overwritten. Board packs are built from locked snapshots so numbers never drift.
4. **Tenant isolation is non-negotiable.** One organisation can never see another's data —
   enforced in the application, in the database, and in the schema itself.
5. **Built for scale.** Stateless API instances, pre-computed rollups, background jobs, and
   time-ordered identifiers, so the platform can serve very large numbers of users.

## 1.5 Glossary

| Term | Meaning |
|---|---|
| Organisation / tenant / workspace | One customer (company, ministry, agency). All its data is isolated |
| Strategic plan | A versioned plan for a period (e.g. FY2024–2026) |
| Framework level | A level of the strategy tree, named by the organisation (e.g. "Strategic pillar", "Perspective") |
| Strategy element | A node at a level: a pillar, objective, goal, outcome… |
| KPI | A measure with baseline, targets and actuals (impact lens) |
| Initiative | A funded piece of work that delivers objectives (execution lens) |
| Milestone | A weighted deliverable of an initiative; drives completion % |
| Verified completion | Completion confirmed by the Strategy Office against evidence |
| pp | Percentage points (e.g. 65% vs 74% planned = 9 pp behind) |
| RAG / health | Green / Amber / Red (and Unknown), calculated by rules |
| Override | A time-limited manual change to calculated health, with a recorded reason |
| Escalation ladder | Levels an unresolved problem moves up (configurable per organisation) |
| Reporting cycle / period | The monthly (or quarterly) submit → review → confirm → lock routine |
| Snapshot | Frozen data for a locked period, used for packs |
| Ruleset | The versioned governance rules an organisation runs on |
