# 19. People, departments and administration API

Read-only lists that power pickers and filters across the web app (owner, sponsor and
assignee pickers; the register's department filter). Managing people is done through
invitations (chapter 5). Administration (sections 19.4 to 19.7) changes members' roles and
access, manages departments and organisation settings, and reads the audit log.

## 19.1 Endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/members` | any member | People directory, by name, a page at a time |
| `GET /api/v1/departments` | any member | Every department, by name |
| `GET /api/v1/admin/members` | Strategy Office, Admin | Members with roles, status and responsibilities |
| `PATCH /api/v1/admin/members/:id` | Strategy Office, Admin | Roles, job title, department, manager |
| `POST /api/v1/admin/members/:id/deactivate` · `/reactivate` | Strategy Office, Admin | End or restore access |
| `POST /api/v1/departments` · `PATCH`/`DELETE /api/v1/departments/:id` | Strategy Office, Admin | Add, rename, recode, move, delete |
| `GET /api/v1/organisation` | any member | Organisation settings |
| `PATCH /api/v1/organisation` | System administrator | Change organisation settings |
| `GET /api/v1/audit` | Admin, Strategy Office, Internal audit | The audit log |

## 19.2 People directory

Lists **active** members of the caller's organisation only (row-level security), ordered by
name. Each entry has the membership id (what pickers send, e.g. as `ownerId`), name, email
(to tell apart two people with the same name), job title, department and roles.

| Parameter | Values | Default |
|---|---|---|
| `q` | Matches name, email or job title (case-insensitive) | — |
| `role` | Only people holding this role, e.g. `EXECUTIVE_SPONSOR` | — |
| `departmentId` | Only people in this department | — |
| `page`, `pageSize` | Paging; `pageSize` at most 50 | 1, 20 |

## 19.3 Departments

Every department by name with its code, parent (departments can nest) and the number of
active members in it (not counting sub-departments).

## 19.4 Members and access

- **List:** active and invited members by default (`?status=ACTIVE,INVITED,DEACTIVATED`),
  by name, with search, role and department filters and counts per status. Each member
  shows their roles, department, manager, when they joined, what they are accountable for
  (initiatives owned and sponsored that are still live, decisions waiting for them), and
  `can` for the caller.
- **Change:** roles (at least one; duplicates removed), job title, department, manager
  (an active member, not themselves). Only a **system administrator** grants or removes the
  administrator role, or changes an administrator at all (`403 ADMIN_ONLY`), and the
  organisation always keeps one active administrator (`409 LAST_ADMIN`). Role changes take
  effect at the member's next session refresh, within the 15-minute access-token lifetime.
- **Deactivate:** the member can no longer sign in (`403 NO_ACTIVE_MEMBERSHIP`), and any
  open session ends at its next refresh. Everything they did stays on record. Not yourself
  (`409 CANNOT_DEACTIVATE_SELF`), never the last administrator, and administrators only by an
  administrator. **Reactivate** restores access with the same roles. Hand over a member's
  initiatives and decisions before deactivating them: the list shows how many they hold.
- Audit events: `MEMBER_UPDATED`, `MEMBER_DEACTIVATED`, `MEMBER_REACTIVATED`.

## 19.5 Managing departments

Add a department (name unique in the organisation, optional code, optional parent), rename
or recode it, or move it under another department; a department can never sit inside itself
(`400` on `parentId`). Deleting is allowed only when it has no members (in any status), no
initiatives and no sub-departments (`409 DEPARTMENT_IN_USE`, naming what is left). Audit
events: `DEPARTMENT_CREATED`, `DEPARTMENT_UPDATED`, `DEPARTMENT_DELETED`.

## 19.6 Organisation settings

Any member reads them: name, workspace address (fixed), sector, country, currency, time
zone, financial year start month, status and terminology (what the organisation calls KPIs,
initiatives, milestones and tasks). A **system administrator** changes them. Time zones are
IANA names (e.g. Africa/Lagos) and currencies ISO 4217 codes; anything else is a field error.
Currency and time zone change how figures and deadlines are shown, not the data. Signed-in
people see the change at their next session refresh. Audit event: `ORGANISATION_UPDATED`.

## 19.7 Audit log

Every recorded change, newest first, read-only, for administrators, the Strategy Office and
internal audit. Each entry has when, who (or the system), the action and a readable label
("Ruleset proposed"), the entity, and its before and after values. Filter by action, entity
type, entity, actor and a date range (inclusive days). The response lists every action and
entity type recorded, for the filters. Sign-ins are recorded too. Audit rows are written in
the same transaction as the change they describe.
