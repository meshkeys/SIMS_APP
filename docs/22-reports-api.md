# 22. Reports and board packs API

Board packs and management reports, built **only from a locked cycle's snapshot**, so the
numbers in a pack always match what management approved, however the live data has moved
since. This chapter covers defining, previewing and requesting packs; producing the files
(PDF, PowerPoint, Excel) follows in slice 12c.

## 22.1 Endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/reports/snapshots` | Strategy Office, Admin | Locked cycles packs can be built from, newest first |
| `POST /api/v1/reports/preview` | Strategy Office, Admin | The content a pack would contain, without saving |
| `POST /api/v1/reports/packs` | Strategy Office, Admin | Request a pack (queued for generation) |
| `GET /api/v1/reports/packs` | Office, Admin, MD/CEO, sponsors, Board, Internal audit | Issued and queued packs, newest first |
| `GET /api/v1/reports/packs/:id` | the same | One pack and its definition |

Board members see packs written **for the Board** only; anything else answers `404`.

## 22.2 Snapshots

Locking a reporting period (chapter 14) freezes a **version 2 snapshot** with everything a
pack needs:

- every active or on-hold initiative: health (with any override), verified and planned
  progress, impact, owner, pillar and whether it is sensitive;
- the strategy tree with its execution score, impact score and health;
- every KPI with its target due at the period's end, latest value and trajectory;
- the decisions still open, the open escalations per ladder level, and the organisation's
  low-value threshold;
- the year's financial benefits: expected, expected to date, realised, and by quarter.

The list shows each snapshot's period, its quarter for a quarter's last month ("Q3 2026"),
when it was locked and its pillars (for a deep dive). Snapshots taken before version 2 are
listed as not usable; building from one answers `409 SNAPSHOT_TOO_OLD`.

## 22.3 Templates, sections and audiences

The catalogue is part of the contract (`REPORT_TEMPLATES`, `REPORT_SECTIONS`,
`REPORT_AUDIENCES` in `@sims/contracts`), so the builder and the server offer the same
choices.

| Template | Default audience | Sections (on by default unless noted) |
|---|---|---|
| Monthly management report | EXCO | Executive summary, pillar performance, delivery vs value, delayed & at-risk, decisions, benefits, full register |
| Quarterly Board pack | Board | Executive summary, pillar performance, delivery vs value, delayed & at-risk, decisions, benefits; register optional |
| Pillar deep dive | EXCO | Pillar overview and objectives, pillar KPIs, pillar initiatives; decisions optional. Needs a pillar |

Sections always print in the template's order. A section the template does not offer, a
repeated section, or a deep dive without a pillar of the snapshot is a field error.

**Audience rule.** For the **Board**, sensitive initiatives are *summarised at pillar
level*: they count in every total and pillar row but are never named (delayed & at-risk,
the matrix, the register, their decisions). The pack reports how many were summarised.
EXCO sees everything. For the Board the decisions section is titled "Decisions required from
the Board", with the Board's own decisions first.

## 22.4 Preview and page count

`POST /reports/preview` returns the **pack content**: title, period, lock time,
organisation, the sections with their data, and the page count. The board pack builder draws
this, and the renderers (slice 12c) print exactly the same content, so a preview never
differs from the file. Each section is one page, except lists: delayed & at-risk (8 rows a
page), the register (20), pillar KPIs and pillar initiatives (12 each). A cover page is added.

Default titles: "Q3 2026 Board pack" (or the month when it is not a quarter end),
"September 2026 management report", "Operations deep dive, September 2026".

## 22.5 Requesting packs

`POST /reports/packs` takes the definition plus formats (PDF, PowerPoint, Excel; at least
one) and an optional title. The pack is saved **queued** with its snapshot, sections,
audience and narrative. A repeat of the same cycle and template gets the next version
(1.0, 1.1…). Audit event: `REPORT_PACK_REQUESTED`.

Each pack lists `available` formats: those with a stored file once the pack is ready. Until
slice 12c produces files, requested packs stay queued.
