# 14. Reporting cycle

The monthly loop that turns claims into verified figures: owners report, the Strategy Office
verifies or challenges, sponsors confirm, and the period locks into a snapshot that reports
and Board packs are built from. Powers **My updates**, the dashboard's cycle tracker and the
Strategy Office's review queue.

## 14.1 The loop

```
Strategy Office opens the period (deadlines from the ruleset)
  ▼
Owner: draft → submit ───────────────▶ Strategy Office: verify ──▶ Sponsor: confirm
            ▲                                   │                        │
            └──── challenge (with a reason) ◀───┴────────────────────────┘
  ▼
Strategy Office: advance stages → lock → snapshots; unreported initiatives turn Unknown
```

Update statuses: `DRAFT → SUBMITTED → REVIEWED → APPROVED`, with `CHALLENGED` sending it back
to the owner. Owners edit only drafts and challenged updates; approved updates are final.

## 14.2 Endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/periods` | any member | Periods of the current plan, newest first, with counts |
| `GET /api/v1/periods/current` | any member | The cycle in progress (tracker), or `null` |
| `GET /api/v1/periods/:id` | any member | One period |
| `POST /api/v1/periods` | Strategy Office, Admin | Open the next period |
| `POST /api/v1/periods/:id/advance` | Strategy Office, Admin | Next stage (submission → Office review → sponsor review) |
| `POST /api/v1/periods/:id/lock` | Strategy Office, Admin | Lock and snapshot |
| `GET /api/v1/my-updates` | any member | What I owe this cycle, most urgent first |
| `GET /api/v1/periods/:id/updates` | Office sees all; sponsors and owners their own | Review queue (`?status=`) |
| `GET /api/v1/periods/:p/updates/:initiativeId` | owner, sponsor, Office, oversight roles | The update form |
| `PUT /api/v1/periods/:p/updates/:initiativeId` | owner, Office | Save draft |
| `POST …/submit` | owner, Office | Submit (optionally with final changes) |
| `POST …/verify` | Office | Verify figures per milestone |
| `POST …/challenge` | Office; sponsor once verified | Send back with a reason |
| `POST …/approve` | sponsor (Office on their behalf) | Confirm |
| `POST …/comments` | owner, sponsor, Office | Comment; an owner writing on a challenged update is recorded as a response |

## 14.3 Periods and deadlines

- Opening takes a name, the period's dates and `opensOn`. Stage deadlines come from the
  ruleset's reporting cycle in **working days** (Mon–Fri) from `opensOn`, closing at
  **17:00 in the organisation's time zone** (daylight saving handled). They are stored on the
  period, so a later rule change never moves a cycle in progress.
- Only one period per plan may be in progress (`PERIOD_IN_PROGRESS`); names are unique.
- The tracker returns `cycleDay` ("Day 6 of 8") and counts: `owed`, `in` (submitted in any
  form), `outstanding`, `drafts`, `awaitingVerification`, `challenged`, `awaitingSponsor`,
  `approved`.
- **Who owes an update:** active initiatives that were active before the deadline and had
  started by the period's end (chapter 7.4).

## 14.4 The update form

One response carries everything the screen needs:

- **Lines**, one per milestone: weight, last verified %, this month's claim, verified % (once
  verified), forecast date, a note. Milestones verified complete are **locked at 100%**.
- **Evaluation**, recalculated on every save: claimed completion, planned completion today,
  variance (pp) and a **health preview** — what the rules engine would say with the claimed
  figures (including caps and forced Red).
- **Checklist** ("Before you submit"):

| Item | Blocking? |
|---|---|
| Every milestone has a completion value | Yes |
| Progress described this period | Yes |
| Variance explanation — when more than the Green limit behind plan | Yes |
| Recovery action — same condition | Yes |
| Evidence uploaded this period where a claim rose above the last verified figure (on milestones that need evidence) | Yes (chapter 21) |

- **Open risks and issues**, the **comment thread**, and `can` — which actions the caller may
  take right now (edit, submit, verify, challenge, approve, comment), so the screen shows
  exactly the right buttons.

## 14.5 Submitting, verifying, confirming

- **Submit** is refused until blocking checklist items are done (`409 UPDATE_INCOMPLETE`,
  listing them). It records claimed and planned progress and the previewed health, copies
  claims and forecasts to the milestones, stamps `lastUpdateAt`, and recalculates health —
  clearing the "Update overdue" flag.
- **Verify** (Strategy Office) needs a figure for every line, **never above the claim**. The
  verified figures become the milestones' verified completion — what progress and health are
  measured on — and a milestone at 100% is marked complete with today's date.
- **Challenge** requires a reason (10+ characters), stored as a `CHALLENGE` comment.
- **Approve** is the sponsor's confirmation; the Strategy Office may confirm on their behalf
  (recorded as such). Approval stamps `lastVerifiedUpdateAt`.
- Audit events: `UPDATE_SUBMITTED`, `UPDATE_RESUBMITTED`, `UPDATE_VERIFIED`,
  `UPDATE_CHALLENGED`, `UPDATE_APPROVED`.

## 14.6 Locking

Locking is refused unless the period is in sponsor review and no update is still submitted,
challenged or — unless `approveAwaitingSponsor: true` — awaiting the sponsor
(`409 UPDATES_PENDING`, naming each initiative). Locking then, in one transaction:

1. approves sponsor-pending updates if asked (recorded as approved at lock);
2. marks the period `LOCKED`;
3. recalculates health — initiatives that owed an update and never reported become
   **Unknown**, unless a hard fact forces Red;
4. writes a progress snapshot for every active initiative (the planned-vs-actual history);
5. writes a `PERIOD_LOCK` report snapshot (portfolio totals and each initiative's figures) —
   the frozen numbers Board packs are built from.

After locking, nothing in the period can change (`PERIOD_LOCKED`).
