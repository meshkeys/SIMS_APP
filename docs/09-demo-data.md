# 9. Demo data

`npm run db:seed` creates **Meridian Financial Group**, a fictional organisation that
reproduces the wireframes. It is used for local development, demos and tests. Re-running
it deletes and recreates the demo tenant in one transaction. It refuses to run in production.

## 9.1 Sign-in

All demo users share the password **`Meridian-demo-2026`**. Emails follow
`firstname.lastname@meridian.example` (`.example` is a reserved, non-routable domain).

| Persona | Email | Roles |
|---|---|---|
| Head, Strategy Office ("AB") | amara.bello@meridian.example | Strategy Office, System Admin |
| Strategy Analyst | daniel.okoro@meridian.example | Strategy Office |
| Head, Digital Business ("HD") | hassan.danjuma@meridian.example | Initiative Owner |
| MD/CEO | ngozi.eze@meridian.example | CEO |
| ED, Business | tunde.bakare@meridian.example | Executive Sponsor |
| Board Chair | olumide.adeyemi@meridian.example | Board |
| Head, Internal Audit | rasheed.bello@meridian.example | Internal Audit |

28 people in total.

## 9.2 Contents

| Area | Data |
|---|---|
| Strategy | FY2024–2026 plan (v3); 2 levels; 5 pillars; 10 objectives; 18 KPIs with 6 months of actuals |
| Portfolio | 45 initiatives: 32 active (21 Green, 7 Amber, 4 Red), 5 pipeline, 6 closed, 2 cancelled; 162 milestones |
| Delivery vs value | 14 on plan & value on track; 5 on plan & below target; 3 behind & value on track; 4 behind & below target; 6 not yet measurable |
| Reporting | Jan–Oct 2026 periods; October in sponsor review: 29 of 32 updates in, 6 challenged, 3 awaiting sponsor |
| Risk | 31 open risks laid out as the heatmap; 4 issues; 16 open escalations (L1 9, L2 5, L3 2) |
| Decisions | 3 open (CR-0142, CR-0139, GOV-031), 3 decided |
| Benefits | ₦4.2bn expected FY2026 (600/900/1,200/1,500 by quarter); ₦1.9bn realised; Q4 forecast ₦900m |
| Reports | Q2 Board pack, August and September management reports |

The e2e suite `test/seed/demo-seed.e2e-spec.ts` pins these numbers.

## 9.3 Wireframe inconsistencies and how they were resolved

Some wireframe screens state the same fact differently. The demo data picks one version so
all screens agree; designers may want to align the wireframes.

| # | Inconsistency | Resolution |
|---|---|---|
| 1 | DIG-007 shown under Operational Excellence in the register, but the dashboard shows Operational Excellence with 0 delayed and Digital with 2 | DIG-007 belongs to Digital Transformation and also contributes 20% to an Operational Excellence objective |
| 2 | DIG-004's October update is "submitted 11 Oct" on the detail page but a "draft" on My updates; last verified Technology development 75% vs 85% | Submitted 11 Oct, challenged by the Strategy Office, owner revising |
| 3 | My updates shows REV-005 for the Head, Digital Business; the register says its owner is the Head, Products | Register kept |
| 4 | Objective O1.1 card says 4 initiatives; detail lists 3 contributors at 50/30/20 | 4 home initiatives plus 2 contributors from other pillars; weights sum to 100% |
| 5 | DIG-004 override "by Executive Sponsor, Digital" but its sponsor is ED, Business | Override by its sponsor, ED, Business |
| 6 | "Core banking API not ready" under DIG-007 (escalations) and DIG-004 (detail) | Recorded on both — both depend on the same API |
