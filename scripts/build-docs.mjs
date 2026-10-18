#!/usr/bin/env node
/**
 * Builds the documentation in docs/ into one downloadable file:
 *   docs/dist/SIMS-Technical-Documentation.html
 *   docs/dist/SIMS-Technical-Documentation.pdf   (via headless Chrome/Edge)
 *
 * Usage: npm run docs:build      (set CHROME_PATH to override browser discovery)
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Marked } from 'marked';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs');
const outDir = join(docsDir, 'dist');
const baseName = 'SIMS-Technical-Documentation';

/** Reading order. New chapters must be added here. */
const CHAPTERS = [
  '01-overview.md',
  '02-architecture.md',
  '03-data-model.md',
  '04-security-and-tenancy.md',
  '05-authentication.md',
  '06-api-conventions.md',
  '07-governance-rules.md',
  '08-development-guide.md',
  '09-demo-data.md',
  '10-roadmap.md',
  '11-decision-records.md',
  '12-strategy-api.md',
  '13-delivery-api.md',
  'CHANGELOG.md',
];

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const escapeHtml = (text) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function gitVersion() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'uncommitted';
  }
}

// ---------------------------------------------------------------------------
// Markdown → HTML, collecting headings for the table of contents
// ---------------------------------------------------------------------------

const toc = [];
const chapterAnchor = {}; // file name → anchor of its first heading
const usedIds = new Set();

function uniqueId(base) {
  let id = base || 'section';
  for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
  usedIds.add(id);
  return id;
}

function renderChapter(file) {
  const markdown = readFileSync(join(docsDir, file), 'utf8');
  const marked = new Marked({ gfm: true });
  let first = true;
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = uniqueId(slug(text));
        if (first) {
          chapterAnchor[file] = id;
          first = false;
        }
        if (depth <= 2) toc.push({ depth, text, id });
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        // Links between chapters become in-document anchors.
        const local = href.match(/^([\w-]+\.md)(#.*)?$/);
        if (local) return `<a href="#__chapter__${local[1]}">${text}</a>`;
        return `<a href="${escapeHtml(href)}">${text}</a>`;
      },
    },
  });
  return `<section class="chapter">\n${marked.parse(markdown)}\n</section>`;
}

const body = CHAPTERS.map(renderChapter)
  .join('\n')
  .replace(/#__chapter__([\w-]+\.md)/g, (_, file) => `#${chapterAnchor[file] ?? ''}`);

const tocHtml = toc
  .map((entry) => `<li class="toc-${entry.depth}"><a href="#${entry.id}">${entry.text}</a></li>`)
  .join('\n');

const built = new Date();
const version = gitVersion();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SIMS — Technical Documentation</title>
<style>
  @page { size: A4; margin: 20mm 18mm 22mm; @bottom-center { content: "SIMS Technical Documentation · " counter(page); font: 8pt system-ui, sans-serif; color: #888; } }
  @page :first { @bottom-center { content: none; } }
  :root { --ink: #1c1f24; --muted: #5b6270; --line: #dfe2e7; --accent: #1f3a5f; --code: #f4f5f7; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font: 10.5pt/1.55 "Segoe UI", system-ui, -apple-system, sans-serif; color: var(--ink); background: #fff; }
  main { max-width: 820px; margin: 0 auto; padding: 0 24px 64px; }
  .cover { min-height: 250mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .cover .mark { width: 56px; height: 56px; border-radius: 12px; background: var(--accent); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 26px; }
  .cover h1 { font-size: 30pt; margin: 28px 0 6px; border: 0; color: var(--ink); }
  .cover .subtitle { font-size: 14pt; color: var(--muted); margin: 0 0 40px; }
  .cover dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; color: var(--muted); margin: 0; }
  .cover dt { font-weight: 600; color: var(--ink); }
  nav.toc { page-break-after: always; }
  nav.toc h2 { margin-top: 0; }
  nav.toc ol { list-style: none; padding: 0; margin: 0; }
  nav.toc li { margin: 2px 0; }
  nav.toc .toc-1 { font-weight: 600; margin-top: 10px; }
  nav.toc .toc-2 { padding-left: 18px; color: var(--muted); font-size: 9.5pt; }
  nav.toc a { color: inherit; text-decoration: none; }
  .chapter { page-break-before: always; }
  h1 { font-size: 20pt; color: var(--accent); border-bottom: 2px solid var(--accent); padding-bottom: 6px; margin: 0 0 14px; }
  h2 { font-size: 14pt; margin: 26px 0 8px; page-break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 18px 0 6px; page-break-after: avoid; }
  p, ul, ol { margin: 0 0 10px; }
  a { color: var(--accent); }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 9.5pt; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid var(--line); padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f0f2f5; font-weight: 600; }
  code { font: 9pt/1.45 "Cascadia Code", Consolas, "SF Mono", monospace; background: var(--code); padding: 1px 4px; border-radius: 3px; }
  pre { background: var(--code); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; overflow-x: auto; page-break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 8.5pt; white-space: pre; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 22px 0; }
  blockquote { margin: 0 0 10px; padding: 6px 12px; border-left: 3px solid var(--accent); color: var(--muted); }
  @media screen { .chapter { border-top: 1px solid var(--line); padding-top: 32px; margin-top: 48px; } }
</style>
</head>
<body>
<main>
  <section class="cover">
    <div class="mark">S</div>
    <h1>SIMS — Technical Documentation</h1>
    <p class="subtitle">Strategic Initiative Management System · Strategy Execution Command Centre</p>
    <dl>
      <dt>Built</dt><dd>${built.toISOString().slice(0, 10)}</dd>
      <dt>Code version</dt><dd>${escapeHtml(version)}</dd>
      <dt>Source</dt><dd>docs/ in the repository (Markdown is the source of truth)</dd>
    </dl>
  </section>
  <nav class="toc">
    <h2>Contents</h2>
    <ol>${tocHtml}</ol>
  </nav>
${body}
</main>
</body>
</html>`;

mkdirSync(outDir, { recursive: true });
const htmlPath = join(outDir, `${baseName}.html`);
writeFileSync(htmlPath, html);
console.log(`HTML  ${htmlPath}`);

// ---------------------------------------------------------------------------
// HTML → PDF with headless Chrome or Edge
// ---------------------------------------------------------------------------

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((path) => path && existsSync(path));
}

const browser = findBrowser();
if (!browser) {
  console.warn('PDF   skipped: no Chrome/Edge found (set CHROME_PATH). The HTML file can be printed to PDF from any browser.');
  process.exit(0);
}

const pdfPath = join(outDir, `${baseName}.pdf`);
execFileSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ],
  { stdio: 'ignore', timeout: 120_000 },
);
if (!existsSync(pdfPath)) {
  console.error('PDF   failed: the browser did not produce a file.');
  process.exit(1);
}
console.log(`PDF   ${pdfPath}`);
