# 23. Workspace set-up API

After sign-up, the founder sets the workspace up in five steps (wireframe page 11):
**organisation**, **strategy framework**, **vision & mission**, **governance defaults** and
**invite your team**. Each step saves on its own and moves the organisation's
`onboardingStep` forward, so "Save and finish later" resumes at the next step. While the
organisation is `ONBOARDING`, every step can be saved again; finishing makes it `ACTIVE`.

## 23.1 Endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/onboarding` | Strategy Office, Admin | Where set-up stands, with everything each step shows |
| `PUT /api/v1/onboarding/organisation` | Strategy Office, Admin | Step 1: name, sector, country, currency, time zone, financial year |
| `PUT /api/v1/onboarding/framework` | Strategy Office, Admin | Step 2: starting framework, strategy levels, terminology |
| `PUT /api/v1/onboarding/vision` | Strategy Office, Admin | Step 3: plan name and period, vision, mission, values, aspiration |
| `PUT /api/v1/onboarding/governance` | Strategy Office, Admin | Step 4: the starting rules |
| `POST /api/v1/onboarding/complete` | Strategy Office, Admin | Finish: the workspace becomes active |
| `GET /api/v1/custom-fields` | any member | Extra fields, by record type and order |
| `POST /api/v1/custom-fields` | Strategy Office, Admin | Add an extra field |
| `DELETE /api/v1/custom-fields/:id` | Strategy Office, Admin | Remove an extra field |

Step 5 uses the invitations API (chapter 5). Every set-up write answers
`409 ONBOARDING_FINISHED` once set-up is finished: from then on the same things change in
Administration (chapter 19) and on the strategy map (chapter 12), where rule changes follow
maker-checker.

## 23.2 The state

`GET /onboarding` (and every save) returns:

- `status` and `step` (the last step saved, 0–5; sign-up saves step 1);
- `organisation` — the settings (chapter 19.6);
- `plan` — the plan being set up, or `null` before the framework step: name, template,
  period, statements, `levels` and `elementCount`;
- `rules` — the rules in force (version 1 during set-up);
- `invitations.pending` and `customFields`;
- `missing` — steps not saved yet (`organisation`, `framework`, `vision`, `governance`; the
  team step is optional), and `canComplete` (a plan exists and set-up is not finished).

## 23.3 The steps

- **Organisation.** The fields from sign-up, editable, plus the financial year start month.
  Time zone and currency are checked as in Administration.
- **Strategy framework.** A template (Strategic pillars, Balanced Scorecard, OKRs, Public
  sector results, Start from scratch), the strategy levels (renamed, added, removed; 1 to
  10) and the terminology (what KPIs, initiatives, milestones and tasks are called).
  - The **first save creates the plan**, named after its period: three financial years from
    the start of the current one (e.g. "Strategic plan 2026–2029", 1 Apr 2026 to
    31 Mar 2029 for an April year). Template starter elements (the four Balanced Scorecard
    perspectives) are added on the top level.
  - Later saves with the **same template** edit the levels in place, by `id`, with the
    plans API rules (a level holding items cannot be removed: `409 LEVEL_IN_USE`).
  - Choosing **another template** starts the levels and elements again, unless KPIs or
    initiatives already exist (`409 FRAMEWORK_IN_USE`).
- **Vision & mission.** Plan name and period (end on or after start), vision, mission,
  values (up to 20) and aspiration. Needs the plan (`409 SETUP_INCOMPLETE`).
- **Governance defaults.** A full ruleset (chapter 7). It **replaces version 1 in place**
  rather than proposing a new version: there is no MD/CEO to approve yet and nothing is
  measured (ADR-032). Audit event `RULESET_SET_UP` lists the changes in words.
- **Finish.** Needs the plan; sets the organisation `ACTIVE` with step 5. Audit event
  `ONBOARDING_COMPLETED`. Signed-in people see the new status at their next session
  refresh.

## 23.4 Custom fields

Extra fields an organisation records on its items, e.g. "Budget code" or "Funding source"
on initiatives (the default record type; KPIs, strategy elements, milestones and risks are
allowed too). Types: text, number, currency, date, choice, multiple choice, yes/no and
person. Choice fields need at least two options; other types take none. The machine `key`
comes from the label ("Funding source" → `funding_source`) and must be unique per record
type (`409 FIELD_EXISTS`). Removing a field keeps values already saved on records. This
slice stores the definitions; the forms that fill them in come with the screens that edit
each record. Audit events: `CUSTOM_FIELD_CREATED`, `CUSTOM_FIELD_DELETED`.
