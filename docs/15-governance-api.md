# 15. Governance API

Risks and issues, decisions, and maker-checker change requests. Powers the **Escalation
centre** (heatmap, register), the dashboard's **Decisions required** panel and the
**decision log**. (The automatic escalation ladder and rules administration follow in the
next slice.)

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
