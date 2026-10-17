# SIMS — Technical documentation

Strategic Initiative Management System · Strategy Execution Command Centre

| # | Chapter | For |
|---|---|---|
| 1 | [Product overview](01-overview.md) | Everyone |
| 2 | [Architecture](02-architecture.md) | Engineers, reviewers |
| 3 | [Data model](03-data-model.md) | Engineers |
| 4 | [Security and multi-tenancy](04-security-and-tenancy.md) | Engineers, security reviewers |
| 5 | [Authentication](05-authentication.md) | Engineers (API and web) |
| 6 | [API conventions](06-api-conventions.md) | API consumers |
| 7 | [Governance rules](07-governance-rules.md) | Product, engineers |
| 8 | [Development guide](08-development-guide.md) | Engineers |
| 9 | [Demo data](09-demo-data.md) | Everyone |
| 10 | [Roadmap and status](10-roadmap.md) | Everyone |
| 11 | [Architecture decision records](11-decision-records.md) | Engineers, reviewers |
| — | [Changelog](CHANGELOG.md) | Everyone |

## Downloadable copy

```bash
npm run docs:build
```

Produces `docs/dist/SIMS-Technical-Documentation.pdf` and `.html` (one file each, with a
table of contents). The PDF uses Chrome or Edge in headless mode; set `CHROME_PATH` if
neither is installed in the usual place.

## Keeping docs current

The Markdown files are the source of truth and live next to the code. Every slice that
changes behaviour updates the relevant chapter, the roadmap and the changelog in the same
commit. Record significant technical choices as a new ADR in chapter 11.
