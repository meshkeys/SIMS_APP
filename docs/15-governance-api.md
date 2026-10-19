# 15. Governance API

Risks and issues, escalations, decisions, and maker-checker change requests. Powers the
**Escalation centre** (ladder, heatmap, open escalations, blocked dependencies, decision log)
and the dashboard's **Decisions required** and escalation panels. (Rules administration
follows in slice 8c.)

## 15.1 Endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/risks` | any member | Register with heatmap and counts |
| `GET /api/v1/risks/:id` | any member who may see it | One risk or issue |
| `POST /api/v1/risks` | initiative's owner/sponsor, Office; portfolio-level: Office | Log a risk or issue |
| `PATCH /api/v1/risks/:id` | risk owner, initiative's owner/sponsor, Office | Update, mitigate, close, reopen |
| `GET /api/v1/decisions` | any member | `?view=open` (default) or `?view=log` |
| `GET /api/v1/decisions/:id` | any member who may see it | One decision |
| `POST /api/v1/decisions` | Strategy Office, Admin | Raise a decision for management |
| `POST /api/v1/decisions/:id/decide` | see 15.3 | Approve, reject or defer |
| `POST /api/v1/initiatives/:id/change-requests` | initiative's owner/sponsor, Office | Request a change to an active baseline |
| `GET /api/v1/change-requests` | any member | `?status=`, `?initiativeId=` |
| `GET /api/v1/change-requests/:id` | any member who may see it | One request with before/after |
| `POST /api/v1/change-requests/:id/withdraw` | requester, Office | Withdraw a pending request |

| `GET /api/v1/escalations` | any member | Ladder with open counts, items oldest first (`?status=`, `?level=`, `?initiativeId=`) |
| `GET /api/v1/escalations/:id` | any member who may see it | One escalation with its level history |
| `POST /api/v1/escalations` | initiative's owner/sponsor, Office; portfolio-level: Office | Raise an escalation |
| `POST /api/v1/escalations/:id/escalate` and `/de-escalate` | the decider at its level, Office | Move up or down one level (reason required) |
| `POST /api/v1/escalations/:id/resolve` | the decider at its level, Office | Resolve (resolution required) |
| `POST /api/v1/escalations/:id/withdraw` | whoever raised it, Office | Withdraw one raised by mistake |
| `POST /api/v1/escalations/sweep` | Strategy Office, Admin | Apply due automatic moves now |
| `GET /api/v1/dependencies` | any member | Blocked and at-risk dependencies across the portfolio |
| `GET /api/v1/rulesets` | Strategy Office, Admin, MD/CEO | Active rules, any pending proposal, every version |
| `POST /api/v1/rulesets/preview` | Strategy Office, Admin | What proposed rules would change today (saves nothing) |
| `POST /api/v1/rulesets` | Strategy Office, Admin | Propose new rules for MD/CEO approval |
| `POST /api/v1/rulesets/:id/withdraw` | Strategy Office, Admin | Withdraw a pending proposal |

Items on sensitive initiatives are hidden from people who may not see them (chapter 12.3).

## 15.2 Risks and issues

- **Risks** may happen: they need likelihood and impact (1–5); severity follows from
  likelihood × impact (15+ critical, 10+ high, 5+ medium, otherwise low) — any severity sent
  is ignored. **Issues** are already happening: severity is set directly.
- **Register:** open items by default (`?status=OPEN,MITIGATED,CLOSED`), most severe first,
  filters for type, severity, initiative, owner, search, and a heatmap cell
  (`?likelihood=3&impact=4`). The response carries the **5×5 heatmap** (rows: impact 5→1;
  columns: likelihood 1→5) and counts.
- Closing or mitigating stamps `closedAt`; reopening clears it.
- **Health follows:** logging, closing or re-rating an item re-runs the initiative's health
  rules — an open critical issue caps it at Amber; closing it releases the cap.
- Each item shows its current open escalation (level and reference), if any.

## 15.3 Decisions

- **Decisions required** (`view=open`): pending items, plus deferred ones whose revisit date
  has arrived, ordered by due date with `overdueDays`. **Log** (`view=log`): decided items,
  newest first.
- Each item says whether the caller may decide it (`canDecide`):
  - the named decision owner — or, when nobody is named, anyone holding the required role;
  - the Strategy Office may record other decisions on the decider's behalf (e.g. an EXCO
    resolution), recorded as such;
  - **change requests are maker-checker**: only the approver decides, never the requester,
    and the Strategy Office cannot decide on anyone's behalf.
- **Outcomes:** approve; reject (reason required); defer (reason and revisit date required —
  it reappears in "Decisions required" on that date).
- **From updates:** an owner ticking "I need a management decision" on a submitted update
  creates a decision for the initiative's sponsor (`DEC-…`), due at the end of sponsor review.
- References: `CR-…` change requests, `DEC-…` raised decisions, `GOV-…` existing governance
  items; each series continues from its highest number.

## 15.4 Change requests (maker-checker)

Once an initiative is active, its baseline — dates, budget, scope and milestone plan
(weights, baseline dates, critical flags, adding/removing milestones) — **cannot be edited
directly by anyone**, the Strategy Office included (`409 BASELINE_LOCKED`). It changes only
through an approved change request.

| Type | May change | Approver |
|---|---|---|
| `BASELINE_CHANGE` | start/end dates; milestones (weight, critical, start/due dates); add or remove milestones | MD/CEO |
| `BUDGET_CHANGE` | baseline budget | the initiative's sponsor |
| `SCOPE_CHANGE` | scope statement | the initiative's sponsor |

- A justification (20+ characters) is required. The request is checked against the current
  baseline (dates in order, milestones of this initiative, at least one weighted milestone,
  milestones with progress cannot be removed).
- If the sponsor is the requester, the MD/CEO approves instead — nobody approves their own
  request.
- Creating a request also creates its decision (same `CR-…` reference) in the approver's
  "Decisions required", titled with a summary ("Approve baseline change for DIG-007: end
  15 Oct 2026 → 26 Nov 2026"). The request stores the values it replaces (`before`).
- **On approval** the change is re-validated against the baseline as it is *now* (it may have
  changed since; `409 CHANGE_NO_LONGER_VALID`), applied, audited as `BASELINE_CHANGED` with the
  reference, and health is recalculated. On rejection nothing changes.
- The requester (or the Strategy Office) may withdraw a pending request.
- Pipeline initiatives (not yet active) are edited directly; a change request there answers
  `409 CHANGE_REQUEST_NOT_NEEDED`.

## 15.5 Escalations

The organisation's ladder (chapter 7.2) decides where items start, who decides at each level
and when unresolved items move up.

- **The centre** returns the ladder (each level's name, description, who decides, its
  timing and how many open items sit there) and the items, **oldest first**. Each item
  carries its level and level name, age and days at the level, the initiative, the linked
  risk, issue or dependency, who must decide (a named person and/or a role), **days until
  it moves up on its own** (null at a level reached only by decision) and `can` for the caller.
- **Raising.** Owners, sponsors and the Strategy Office raise for an initiative; portfolio
  items (no initiative) are for the Strategy Office. A risk or issue can be escalated by id:
  its initiative is used, it must be open, and only once at a time (`409 ALREADY_ESCALATED`).
  Items start at level 1, or at `criticalStartsAtLevel` when critical. References continue
  the `ESC-…` series.
- **Who decides.** Owner and sponsor levels name the initiative's owner or sponsor; a role
  level names the role (and the person, when exactly one member holds it), and anyone holding
  the role may act. Portfolio items at owner or sponsor levels go to the Strategy Office.
- **Moving.** The decider at the current level, or the Strategy Office, moves an item up or
  down one level with a reason of at least 10 characters. The ends of the ladder answer
  `409 TOP_OF_LADDER` / `409 BOTTOM_OF_LADDER`; anyone else gets `403 NOT_DECIDER`. Moving
  up past a manual-only level (e.g. EXCO referring to the Board) is done this way.
- **Closing.** The decider or the Strategy Office resolves with a resolution; whoever raised
  it, or the Strategy Office, withdraws it. Closed items answer `409 ESCALATION_CLOSED`.
- **Automatic moves** are applied before the escalation centre, an escalation or the
  dashboard is read, and on `POST /escalations/sweep`. Each step is recorded on the day it
  fell due, with no actor, reason `AUTO_TIMEOUT`, and the ruleset version. It is safe to run
  repeatedly or concurrently. (Scheduled runs and notifications come with slice 11.)
- Audit events: `ESCALATION_RAISED`, `ESCALATED`, `DE_ESCALATED`, `ESCALATION_RESOLVED`,
  `ESCALATION_WITHDRAWN`.

## 15.6 Portfolio dependencies

`GET /dependencies` lists dependencies between initiatives the caller can see (blocked and
at risk by default, `?status=` for others): blocked first, critical path first, then the
longest blocked. Each has the waiting initiative (`from`), the one it waits on (`to`), the
description, `blockedSince` and `neededBy`.

## 15.7 Rules (rulesets)

The process is described in chapter 7.6.

- **Overview** returns the active version (its rules, what it changed against the version
  before, who proposed and approved it, since when), any pending proposal (with its decision
  id) and every version, newest first. An organisation that never saved rules gets the
  built-in defaults.
- **Preview** takes a full ruleset and returns: the changes in plain words; health counts
  under the live and proposed rules (Green, Amber, Red, Unknown) with each initiative that
  would change; KPI trajectory counts with each KPI that would change; and the
  delivered-but-low-value count under each. Both sides use the same facts at the same moment.
- **Propose** validates the rules (`400` with paths like `config.rag.amberMaxPpBehind`),
  refuses a copy of the live rules (`400 NO_CHANGES`) or a second pending proposal
  (`409 RULESET_PENDING`), and creates the next version, a `RULESET_CHANGE` approval and a
  `RUL-…` decision for the MD/CEO, due in 7 days. The decision's context lists the changes.
- **Deciding** uses `POST /decisions/:id/decide`. Decisions of this kind are
  `RULE_CHANGE`. Approval activates the version and recalculates (chapter 7.6); rejection
  marks it rejected. Deferring leaves it pending.
- **Withdraw** closes a pending proposal and its decision (`409 RULESET_NOT_PENDING`
  otherwise).
- Audit events: `RULESET_PROPOSED`, `RULESET_APPROVED`, `RULESET_REJECTED`,
  `RULESET_WITHDRAWN`.

## 15.8 Not yet

- Escalations are raised by people. Raising them automatically for missed updates, missing
  KPI actuals and long-blocked dependencies comes with scheduled jobs (slice 11), as do
  reminders and notifications to the person who must decide.
