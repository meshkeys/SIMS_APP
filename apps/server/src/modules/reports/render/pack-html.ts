import {
  type PackContent,
  type PackInitiativeRow,
  type PackSection,
  REPORT_AUDIENCES,
  ROLE_LABELS,
} from '@sims/contracts';
import { escapeHtml as e } from '../../../infrastructure/mail/index.js';
import {
  COLOURS,
  HEALTH_LABEL,
  kpiValue,
  longDate,
  money,
  pages,
  percent,
  pp,
  TRAJECTORY_LABEL,
} from './formatting.js';

/** Rows per printed page; must match the page estimates in assemblePack. */
const ROWS = { exceptions: 8, register: 20, kpis: 12, initiatives: 12 };

type Section<K extends PackSection['key']> = Extract<PackSection, { key: K }>;

/**
 * A pack as one self-contained HTML document (A4 landscape, no scripts, no
 * external requests), printed to PDF by headless Chrome. Every value is
 * escaped; the layout mirrors the web app's preview.
 */
export function renderPackHtml(pack: PackContent): string {
  const pagesHtml: string[] = [cover(pack)];
  for (const section of pack.sections)
    pagesHtml.push(...renderSection(section, pack));
  const total = pagesHtml.length;
  const body = pagesHtml
    .map(
      (content, i) => `<section class="page">
  ${content}
  <footer><span>${e(pack.organisation)} · ${e(pack.title)}</span><span>Page ${i + 1} of ${total}</span></footer>
</section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${e(pack.title)}</title>
<style>${STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function cover(pack: PackContent): string {
  const note =
    pack.sensitiveSummarised > 0
      ? `<p class="note">Sensitive initiatives (${pack.sensitiveSummarised}) are summarised at pillar level for this audience.</p>`
      : '';
  return `<div class="cover">
  <p class="eyebrow">${e(pack.organisation)}</p>
  <h1>${e(pack.title)}</h1>
  <p class="lead">${e(pack.period)} · prepared for ${e(REPORT_AUDIENCES[pack.audience])}</p>
  <p class="muted">Figures from the reporting cycle locked on ${e(longDate(pack.lockedAt))}, as approved by management.</p>
  ${note}
  <ol class="contents">${pack.sections.map((s) => `<li>${e(s.title)}</li>`).join('')}</ol>
</div>`;
}

function renderSection(section: PackSection, pack: PackContent): string[] {
  const h = (suffix = '') => `<h2>${e(section.title)}${suffix}</h2>`;
  switch (section.key) {
    case 'executive_summary':
      return [executiveSummary(section, pack, h())];
    case 'pillar_performance':
      return [`${h()}${pillarTable(section.pillars)}`];
    case 'delivery_vs_value':
      return [`${h()}${matrix(section)}`];
    case 'exceptions':
      return paged(
        section.initiatives,
        ROWS.exceptions,
        (rows, more) =>
          `${h(more)}${rows.length ? initiativeTable(rows, true) : empty('No initiative is at risk or delayed.')}`,
      );
    case 'decisions':
      return [
        `${h()}${
          section.decisions.length
            ? table(
                ['Ref', 'Decision', 'Required from', 'Initiative', 'Due'],
                section.decisions.map((d) => [
                  `<span class="mono">${e(d.reference)}</span>`,
                  e(d.title),
                  e(ROLE_LABELS[d.requiredFrom]),
                  e(d.initiative ?? 'Portfolio'),
                  e(d.dueDate ? longDate(`${d.dueDate}T00:00:00Z`) : '—'),
                ]),
              )
            : empty('No decisions are waiting.')
        }`,
      ];
    case 'benefits':
      return [`${h()}${benefits(section)}`];
    case 'register':
      return paged(
        section.initiatives,
        ROWS.register,
        (rows, more) => `${h(more)}${initiativeTable(rows, false)}`,
      );
    case 'pillar_overview':
      return [
        `${h()}${pillarTable([section.pillar])}<h3>Objectives</h3>${table(
          ['Objective', 'Health', 'Execution', 'Impact'],
          section.objectives.map((o) => [
            `<span class="mono">${e(o.code)}</span> ${e(o.title)}`,
            badge(o.health),
            percent(o.executionScore),
            percent(o.impactScore),
          ]),
        )}`,
      ];
    case 'pillar_kpis':
      return paged(
        section.kpis,
        ROWS.kpis,
        (rows, more) =>
          `${h(more)}${table(
            ['KPI', 'Objective', 'Baseline', 'Target', 'Latest', 'Trajectory'],
            rows.map((k) => [
              `<span class="mono">${e(k.code)}</span> ${e(k.name)}`,
              e(k.objective),
              e(kpiValue(k.baseline, k.unit)),
              e(kpiValue(k.target, k.unit)),
              `<strong>${e(kpiValue(k.latestValue, k.unit))}</strong>`,
              e(TRAJECTORY_LABEL[k.trajectory]),
            ]),
          )}`,
      );
    case 'pillar_initiatives':
      return paged(
        section.initiatives,
        ROWS.initiatives,
        (rows, more) => `${h(more)}${initiativeTable(rows, true)}`,
      );
  }
}

function paged<T>(
  rows: readonly T[],
  size: number,
  render: (rows: T[], suffix: string) => string,
): string[] {
  const chunks = pages(rows, size);
  return chunks.map((chunk, i) =>
    render(
      chunk,
      chunks.length > 1
        ? ` <span class="muted">(${i + 1} of ${chunks.length})</span>`
        : '',
    ),
  );
}

function executiveSummary(
  section: Section<'executive_summary'>,
  pack: PackContent,
  heading: string,
): string {
  const h = section.headline;
  const benefitsSection = pack.sections.find((s) => s.key === 'benefits') as
    Section<'benefits'> | undefined;
  const currency = benefitsSection?.currency ?? 'NGN';
  const tile = (label: string, value: string, tone = '') =>
    `<div class="tile ${tone}"><p>${e(label)}</p><strong>${e(value)}</strong></div>`;
  return `${heading}
  ${section.narrative ? `<p class="narrative">${e(section.narrative)}</p>` : ''}
  <div class="tiles">
    ${tile('Active initiatives', String(h.initiatives))}
    ${tile('On track', String(h.onTrack), 'green')}
    ${tile('At risk', String(h.atRisk), 'amber')}
    ${tile('Delayed', String(h.delayed), 'red')}
    ${tile('KPIs on trajectory', `${h.kpisOnTrajectory} / ${h.kpisTotal}`)}
    ${tile('Benefits realised', `${money(h.benefitsRealised, currency)}${h.benefitsRealisedPct === null ? '' : ` · ${h.benefitsRealisedPct}%`}`)}
    ${tile('Open escalations', String(h.openEscalations))}
    ${tile('Decisions pending', String(h.decisionsPending))}
  </div>
  ${h.unknown ? `<p class="muted">${h.unknown} initiative(s) had no verified update and are reported as Unknown.</p>` : ''}`;
}

function pillarTable(
  pillars: Section<'pillar_performance'>['pillars'],
): string {
  return table(
    [
      'Pillar',
      'Health',
      'Execution vs impact',
      'Initiatives',
      'At risk',
      'Delayed',
    ],
    pillars.map((p) => [
      `<span class="mono">${e(p.code)}</span> ${e(p.title)}`,
      badge(p.health),
      `${bar(p.executionScore, COLOURS.primary)} ${percent(p.executionScore)}<br>${bar(p.impactScore, COLOURS.impact)} ${percent(p.impactScore)}`,
      String(p.initiatives),
      String(p.atRisk),
      String(p.delayed),
    ]),
  );
}

function matrix(section: Section<'delivery_vs_value'>): string {
  const cell = (title: string, advice: string, codes: string[], tone: string) =>
    `<div class="cell ${tone}"><p class="muted">${e(title)}</p><strong>${codes.length}</strong><p class="small">${e(advice)}</p><p class="codes">${codes.map(e).join(' · ')}</p></div>`;
  const q = section.quadrants;
  return `<div class="matrix">
    ${cell('Behind plan · value on track', 'Protect momentum, unblock delivery', q.BEHIND_VALUE_OK, '')}
    ${cell('On plan · value on track', 'Delivering strategy as intended', q.ON_PLAN_VALUE_OK, 'green')}
    ${cell('Behind plan · value below target', 'Intervene or stop', q.BEHIND_VALUE_LOW, 'red')}
    ${cell('On plan · value below target', 'Delivered, but not creating value: review the business case', q.ON_PLAN_VALUE_LOW, 'amber outlined')}
  </div>
  <p class="muted">Value below target means impact under ${section.thresholdPct}% of target. ${q.NOT_MEASURABLE.length} initiative(s) are not yet measurable.</p>`;
}

function benefits(section: Section<'benefits'>): string {
  const max = Math.max(
    1,
    ...section.quarters.flatMap((q) => [
      q.expected,
      q.realised ?? 0,
      q.forecast ?? 0,
    ]),
  );
  const width = 640;
  const height = 220;
  const slot = width / section.quarters.length;
  const y = (v: number) => height - 30 - (v / max) * (height - 50);
  const bars = section.quarters
    .map((q, i) => {
      const x = i * slot + slot / 2;
      const second = q.realised ?? q.forecast;
      const forecast = q.realised === null && q.forecast !== null;
      return `<rect x="${x - 34}" y="${y(q.expected)}" width="30" height="${height - 30 - y(q.expected)}" fill="#${COLOURS.expected}"/>
      ${
        second === null
          ? ''
          : `<rect x="${x + 4}" y="${y(second)}" width="30" height="${height - 30 - y(second)}" fill="${forecast ? 'none' : `#${COLOURS.impact}`}" stroke="#${COLOURS.impact}" stroke-width="${forecast ? 2 : 0}" stroke-dasharray="${forecast ? '5 4' : '0'}"/>
             <text x="${x + 19}" y="${y(second) - 6}" text-anchor="middle" font-size="11">${e(money(second, section.currency))}</text>`
      }
      <text x="${x}" y="${height - 10}" text-anchor="middle" font-size="12" fill="#${COLOURS.muted}">${e(q.label)}</text>`;
    })
    .join('');
  return `<div class="tiles three">
    <div class="tile"><p>Expected, FY${section.year}</p><strong>${e(money(section.expected, section.currency))}</strong></div>
    <div class="tile"><p>Realised to date</p><strong>${e(money(section.realisedToDate, section.currency))}</strong></div>
    <div class="tile"><p>Of year-to-date expectation</p><strong>${percent(section.realisedPctOfExpected)}</strong></div>
  </div>
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Expected versus realised benefits by quarter">${bars}</svg>
  <p class="legend"><span class="key expected"></span>Expected <span class="key realised"></span>Realised <span class="key forecast"></span>Forecast</p>`;
}

function initiativeTable(
  rows: PackInitiativeRow[],
  withImpact: boolean,
): string {
  return table(
    [
      'Initiative',
      'Pillar',
      'Owner',
      'Health',
      'Verified',
      'Planned',
      'Gap',
      ...(withImpact ? ['Impact'] : []),
    ],
    rows.map((i) => [
      `<span class="mono">${e(i.code)}</span> ${e(i.title)}`,
      e(i.pillar ?? '—'),
      e(i.owner ?? '—'),
      badge(i.health),
      percent(i.verifiedProgress),
      percent(i.plannedProgress),
      `<span class="nowrap ${i.gapPp < 0 ? 'neg' : ''}">${pp(i.gapPp)}</span>`,
      ...(withImpact ? [e(i.impactSummary ?? percent(i.impactScore))] : []),
    ]),
  );
}

function table(headings: string[], rows: string[][]): string {
  return `<table><thead><tr>${headings.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

const badge = (health: keyof typeof HEALTH_LABEL) =>
  `<span class="badge ${health.toLowerCase()}">${HEALTH_LABEL[health]}</span>`;

const bar = (value: number | null, colour: string) =>
  `<span class="bar"><span style="width:${Math.max(0, Math.min(100, value ?? 0))}%;background:#${colour}"></span></span>`;

const empty = (text: string) => `<p class="muted empty">${e(text)}</p>`;

const STYLES = `
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Inter", "Segoe UI", Arial, sans-serif; color: #${COLOURS.ink}; font-size: 11pt; }
.page { width: 297mm; height: 210mm; padding: 16mm 18mm 20mm; position: relative; break-after: page; overflow: hidden; }
.page:last-child { break-after: auto; }
footer { position: absolute; left: 18mm; right: 18mm; bottom: 9mm; display: flex; justify-content: space-between; font-size: 8pt; color: #${COLOURS.muted}; border-top: 1px solid #${COLOURS.border}; padding-top: 3mm; }
h1 { font-size: 30pt; margin: 6mm 0 3mm; color: #${COLOURS.primary}; }
h2 { font-size: 17pt; margin: 0 0 6mm; color: #${COLOURS.primary}; }
h3 { font-size: 12pt; margin: 6mm 0 3mm; }
.cover { padding-top: 22mm; }
.eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 9pt; color: #${COLOURS.muted}; margin: 0; }
.lead { font-size: 14pt; margin: 0 0 3mm; }
.muted { color: #${COLOURS.muted}; }
.small { font-size: 8.5pt; }
.note { background: #${COLOURS.surface}; padding: 3mm 4mm; border-radius: 2mm; font-size: 9.5pt; }
.contents { margin-top: 10mm; column-count: 2; font-size: 10.5pt; line-height: 1.7; }
.narrative { font-size: 12pt; line-height: 1.5; max-width: 220mm; border-left: 3px solid #${COLOURS.impact}; padding-left: 4mm; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin: 4mm 0; }
.tiles.three { grid-template-columns: repeat(3, 1fr); }
.tile { border: 1px solid #${COLOURS.border}; border-radius: 2mm; padding: 4mm; }
.tile p { margin: 0 0 2mm; font-size: 9pt; color: #${COLOURS.muted}; }
.tile strong { font-size: 18pt; }
.tile.green { background: #${COLOURS.health.GREEN.fill}; } .tile.amber { background: #${COLOURS.health.AMBER.fill}; } .tile.red { background: #${COLOURS.health.RED.fill}; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th { text-align: left; font-weight: 600; color: #${COLOURS.muted}; background: #${COLOURS.surface}; padding: 2mm 2.5mm; }
td { padding: 2.2mm 2.5mm; border-bottom: 1px solid #${COLOURS.border}; vertical-align: top; }
.mono { font-family: Consolas, "Courier New", monospace; font-size: 8.5pt; color: #${COLOURS.muted}; }
.badge { display: inline-block; padding: .4mm 2mm; border-radius: 3mm; font-size: 8.5pt; font-weight: 600; }
.badge.green { background: #${COLOURS.health.GREEN.fill}; color: #${COLOURS.health.GREEN.text}; }
.badge.amber { background: #${COLOURS.health.AMBER.fill}; color: #${COLOURS.health.AMBER.text}; }
.badge.red { background: #${COLOURS.health.RED.fill}; color: #${COLOURS.health.RED.text}; }
.badge.unknown { background: #${COLOURS.health.UNKNOWN.fill}; color: #${COLOURS.health.UNKNOWN.text}; }
.bar { display: inline-block; width: 30mm; height: 2.4mm; background: #${COLOURS.surface}; border-radius: 1mm; vertical-align: middle; overflow: hidden; }
.bar span { display: block; height: 100%; }
.nowrap { white-space: nowrap; }
.neg { color: #${COLOURS.health.RED.text}; font-weight: 600; }
.matrix { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
.cell { border-radius: 2mm; padding: 4mm; background: #${COLOURS.surface}; min-height: 40mm; }
.cell p { margin: 0 0 1.5mm; } .cell strong { font-size: 20pt; }
.cell.green { background: #${COLOURS.health.GREEN.fill}; } .cell.red { background: #${COLOURS.health.RED.fill}; } .cell.amber { background: #${COLOURS.health.AMBER.fill}; }
.cell.outlined { outline: 2px solid #${COLOURS.impact}; }
.codes { font-family: Consolas, monospace; font-size: 8pt; color: #${COLOURS.muted}; }
.legend { font-size: 9pt; color: #${COLOURS.muted}; }
.key { display: inline-block; width: 3mm; height: 3mm; margin: 0 1.5mm 0 4mm; vertical-align: middle; }
.key.expected { background: #${COLOURS.expected}; } .key.realised { background: #${COLOURS.impact}; } .key.forecast { border: 1.5px dashed #${COLOURS.impact}; }
.empty { margin-top: 10mm; }
`;
