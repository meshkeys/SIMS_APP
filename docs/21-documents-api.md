# 21. Documents and evidence API

Evidence behind progress claims: files attached to milestones, checked by the Strategy
Office when it verifies an update. The same storage will hold generated board packs
(slice 12c).

## 21.1 Endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/milestones/:id/documents` | anyone who may see the initiative | Evidence on a milestone, newest first |
| `POST /api/v1/milestones/:id/documents` | the initiative's owner or sponsor, the Strategy Office | Upload one file (multipart, field `file`) |
| `GET /api/v1/documents/:id/download` | anyone who may see the initiative | Download the file |
| `DELETE /api/v1/documents/:id` | the uploader, the Strategy Office | Remove a file not yet reviewed |

Milestones of sensitive initiatives answer `404` to people who may not see them, as
everywhere else (chapter 12.3).

## 21.2 Uploading

- **Accepted types:** PDF, PNG, JPEG, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), CSV
  and plain text. The type comes from the file name's extension **and must match the file's
  first bytes** (a PDF starts `%PDF-`, Office files are zip archives, text has no NUL
  bytes). What the browser claims is ignored. Anything else is
  `415 FILE_TYPE_NOT_ALLOWED`; a renamed file is `415 FILE_CONTENT_MISMATCH`.
- **Size:** up to `UPLOAD_MAX_MB` (20 MB by default). The limit is enforced while the file
  streams in, so an oversized upload is cut off rather than held in memory
  (`413 FILE_TOO_LARGE`). Empty files and requests without a file are `400`.
- **Names** are cleaned for display: folders, control and reserved characters are removed
  and names are kept to 200 characters ("../../Q3 report?.pdf" → "Q3 report_.pdf").
- Each file is stored under a key the server builds,
  `<organisationId>/Milestone/<milestoneId>/<documentId>`, with a SHA-256 checksum in the
  row. If the database write fails, the stored bytes are removed again.
- Audit events: `EVIDENCE_UPLOADED` and `EVIDENCE_REMOVED`, on the milestone. Uploads show in
  the initiative's activity feed.

## 21.3 Downloading

Files are always served as attachments, never rendered by the browser:
`Content-Disposition: attachment` (with a UTF-8 name), the stored type,
`X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store` and a sandboxing
`Content-Security-Policy`. A row whose file is missing from storage (for example the demo
data, which lists files without storing them) answers `404 DOCUMENT_FILE_MISSING`.

## 21.4 Evidence in the reporting cycle

- **Evidence for an update** is what was uploaded to each milestone **during the period**
  (on or after its start). Files from earlier months stay listed on the milestone but do not
  count again. The update form returns each line's `evidence` and `evidenceCount`. The review
  queue's "missing evidence" count only flags claims above the last verified figure on
  milestones that need evidence and have none this period.
- **Verifying an update marks its evidence as reviewed** (who and when). Reviewed evidence is
  part of the verified record: it can no longer be removed (`409 DOCUMENT_REVIEWED`).
- **Removing** is a soft delete. The file disappears from lists and counts but the row stays
  for the audit trail. Purging the stored bytes is left to a clean-up job (slice 11).
- Evidence becomes a **blocking** checklist item in the next slice, when the update form
  can upload files.

## 21.5 Storage

Chosen by settings (chapter 8.4), so development needs no extra service:

| `STORAGE_DRIVER` | Where files go | Use for |
|---|---|---|
| `local` (default) | A folder, `STORAGE_LOCAL_DIR` (default `var/storage` under the server) | Development, tests, single-server installs on a backed-up volume |
| `s3` | Any S3-compatible service: `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (non-AWS), keys or the default credential chain, `S3_FORCE_PATH_STYLE` | Production: AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces… |

The bucket stays private: every file goes through the API's permission checks. Keys are
validated (no `..`, no absolute paths), and the local driver writes to a temporary file and
renames it into place, so a crash never leaves half a file under a key.
