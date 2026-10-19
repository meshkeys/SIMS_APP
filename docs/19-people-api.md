# 19. People and departments API

Read-only lists that power pickers and filters across the web app (owner, sponsor and
assignee pickers; the register's department filter). Managing people is done through
invitations (chapter 5); managing departments arrives with the Administration screen.

## 19.1 Endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/members` | any member | People directory, by name, a page at a time |
| `GET /api/v1/departments` | any member | Every department, by name |

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
