# 22. Reports and board packs API

Board packs and management reports, built **only from a locked cycle's snapshot**, so the
numbers in a pack always match what management approved, however the live data has moved
since. A requested pack is generated as a background job in PDF, PowerPoint and/or Excel,
stored, and downloaded from the issued packs list.

## 22.1 Endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/reports/snapshots` | Strategy Office, Admin | Locked cycles packs can be built from, newest first |
| `POST /api/v1/reports/preview` | Strategy Office, Admin | The content a pack would contain, without saving |
| `POST /api/v1/reports/packs` | Strategy Office, Admin | Request a pack (queued for generation) |
| `GET /api/v1/reports/packs` | Office, Admin, MD/CEO, sponsors, Board, Internal audit | Issued and queued packs, newest first |
| `GET /api/v1/reports/packs/:id` | the same | One pack and its definition |
| `GET /api/v1/reports/packs/:id/download?format=PDF` | the same | Download one generated file |
| `POST /api/v1/reports/packs/:id/regenerate` | Strategy Office, Admin | Generate a failed pack again, or re-render a ready one |

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

Each pack lists `available` formats: those with a stored file once the pack is ready.

## 22.6 Generation

Requesting a pack queues the job `report-pack.generate` once the pack is saved. The job:

1. marks the pack **generating**;
2. assembles the content from the pack's snapshot with `assemblePack`, the same function
   the preview uses, so a file never differs from its preview;
3. renders each requested format and stores it (chapter 21.5) under
   `<organisationId>/ReportPack/<packId>/v<version>.<pdf|pptx|xlsx>`;
4. marks the pack **ready** and issued (`REPORT_PACK_ISSUED`). Any error marks it
   **failed** with the message (`REPORT_PACK_FAILED`), and the queue retries it up to three
   times with back-off.

| Format | How it is made |
|---|---|
| PDF | A self-contained HTML document (A4 landscape, inline styles and SVG charts, no scripts) printed by headless Chrome or Chromium. JavaScript is off and every network request is blocked while printing. Page count and numbering match the estimate. |
| PowerPoint | A 16:9 deck (pptxgenjs): cover slide, then one slide per page, with tables, the delivery-vs-value quadrants and a native benefits chart. |
| Excel | A data appendix (exceljs): an About sheet, then one sheet per section with typed cells (numbers, dates, colour-coded health), filters on initiative lists. |

All three apply the same audience rule: a Board pack never names a sensitive initiative.

**Downloads** are attachments named after the pack, e.g. "Q3 2026 Board pack v1.0.pdf". A
format that was not requested, or a pack that is not ready, is `409 PACK_NOT_READY`; a file
missing from storage is `404 PACK_FILE_MISSING` (the demo's issued packs list files without
storing them; regenerate them to produce real files).

**Regenerate** re-queues a failed or ready pack (not one already queued or generating:
`409 PACK_IN_PROGRESS`). The version stays the same: the figures come from the same
snapshot, so they cannot change.

PDF needs Chrome, Chromium or Edge on the server. It is found in the usual places or set
with `CHROME_PATH`; production images must include it (for example `chromium` on Debian).
