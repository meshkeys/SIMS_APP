import {
  type PackContent,
  type PackInitiativeRow,
  REPORT_AUDIENCES,
  ROLE_LABELS,
} from '@sims/contracts';
import ExcelJS from 'exceljs';
import {
  COLOURS,
  HEALTH_LABEL,
  longDate,
  TRAJECTORY_LABEL,
} from './formatting.js';

/** Excel fill colours need an alpha byte. */
const fill = (rgb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: `FF${rgb}` },
});

/**
 * The pack's figures as an Excel data appendix: one sheet per section with
 * typed cells (percentages are numbers, money is money), so readers can sort,
 * filter and chart. Same audience rule as the PDF: sensitive initiatives are
 * never named in a Board pack.
 */
export async function renderPackXlsx(pack: PackContent): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIMS';
  workbook.created = new Date(pack.lockedAt);

  const about = workbook.addWorksheet('About');
  about.columns = [{ width: 26 }, { width: 70 }];
  about.addRows([
    ['Pack', pack.title],
    ['Organisation', pack.organisation],
    ['Period', pack.period],
    ['Audience', REPORT_AUDIENCES[pack.audience]],
    ['Figures as locked on', longDate(pack.lockedAt)],
    ['Sections', pack.sections.map((s) => s.title).join(', ')],
    ...(pack.sensitiveSummarised
      ? [
          [
            'Note',
            `Sensitive initiatives (${pack.sensitiveSummarised}) are summarised at pillar level for this audience.`,
          ],
        ]
      : []),
  ]);
  about.getColumn(1).font = { bold: true };

  for (const section of pack.sections) {
    switch (section.key) {
      case 'executive_summary': {
        const sheet = sheetWith(workbook, 'Summary', [
          { header: 'Measure', key: 'measure', width: 30 },
          { header: 'Value', key: 'value', width: 16 },
        ]);
        const h = section.headline;
        sheet.addRows([
          { measure: 'Active initiatives', value: h.initiatives },
          { measure: 'On track', value: h.onTrack },
          { measure: 'At risk', value: h.atRisk },
          { measure: 'Delayed', value: h.delayed },
          { measure: 'Unknown', value: h.unknown },
          { measure: 'KPIs on trajectory', value: h.kpisOnTrajectory },
          { measure: 'KPIs', value: h.kpisTotal },
          { measure: 'Benefits realised to date', value: h.benefitsRealised },
          {
            measure: 'Realised, % of year-to-date expectation',
            value: h.benefitsRealisedPct,
          },
          { measure: 'Open escalations', value: h.openEscalations },
          { measure: 'Decisions pending', value: h.decisionsPending },
        ]);
        if (section.narrative)
          sheet.addRow({
            measure: 'Executive narrative',
            value: section.narrative,
          });
        break;
      }
      case 'pillar_performance': {
        const sheet = sheetWith(workbook, 'Pillars', [
          { header: 'Code', key: 'code', width: 8 },
          { header: 'Pillar', key: 'title', width: 34 },
          { header: 'Health', key: 'health', width: 12 },
          { header: 'Execution %', key: 'execution', width: 12 },
          { header: 'Impact %', key: 'impact', width: 12 },
          { header: 'Initiatives', key: 'initiatives', width: 12 },
          { header: 'At risk', key: 'atRisk', width: 10 },
          { header: 'Delayed', key: 'delayed', width: 10 },
        ]);
        for (const p of section.pillars) {
          const row = sheet.addRow({
            code: p.code,
            title: p.title,
            health: HEALTH_LABEL[p.health],
            execution: p.executionScore,
            impact: p.impactScore,
            initiatives: p.initiatives,
            atRisk: p.atRisk,
            delayed: p.delayed,
          });
          row.getCell('health').fill = fill(COLOURS.health[p.health].fill);
        }
        break;
      }
      case 'delivery_vs_value': {
        const sheet = sheetWith(workbook, 'Delivery vs value', [
          { header: 'Quadrant', key: 'quadrant', width: 36 },
          { header: 'Initiatives', key: 'count', width: 12 },
          { header: 'Codes', key: 'codes', width: 80 },
        ]);
        const names = {
          ON_PLAN_VALUE_OK: 'On plan · value on track',
          ON_PLAN_VALUE_LOW: 'On plan · value below target',
          BEHIND_VALUE_OK: 'Behind plan · value on track',
          BEHIND_VALUE_LOW: 'Behind plan · value below target',
          NOT_MEASURABLE: 'Not yet measurable',
        } as const;
        for (const [key, codes] of Object.entries(section.quadrants))
          sheet.addRow({
            quadrant: names[key as keyof typeof names],
            count: codes.length,
            codes: codes.join(', '),
          });
        break;
      }
      case 'exceptions':
        initiativeSheet(workbook, 'At risk & delayed', section.initiatives);
        break;
      case 'register':
        initiativeSheet(workbook, 'Register', section.initiatives);
        break;
      case 'pillar_initiatives':
        initiativeSheet(workbook, 'Pillar initiatives', section.initiatives);
        break;
      case 'decisions': {
        const sheet = sheetWith(workbook, 'Decisions', [
          { header: 'Ref', key: 'reference', width: 11 },
          { header: 'Decision', key: 'title', width: 60 },
          { header: 'Required from', key: 'from', width: 20 },
          { header: 'Initiative', key: 'initiative', width: 12 },
          {
            header: 'Due',
            key: 'due',
            width: 13,
            style: { numFmt: 'dd mmm yyyy' },
          },
        ]);
        for (const d of section.decisions)
          sheet.addRow({
            reference: d.reference,
            title: d.title,
            from: ROLE_LABELS[d.requiredFrom],
            initiative: d.initiative ?? 'Portfolio',
            due: d.dueDate ? new Date(`${d.dueDate}T00:00:00Z`) : null,
          });
        break;
      }
      case 'benefits': {
        const sheet = sheetWith(workbook, 'Benefits', [
          { header: 'Quarter', key: 'label', width: 10 },
          {
            header: `Expected (${section.currency})`,
            key: 'expected',
            width: 20,
            style: { numFmt: '#,##0' },
          },
          {
            header: `Realised (${section.currency})`,
            key: 'realised',
            width: 20,
            style: { numFmt: '#,##0' },
          },
          {
            header: `Forecast (${section.currency})`,
            key: 'forecast',
            width: 20,
            style: { numFmt: '#,##0' },
          },
        ]);
        for (const q of section.quarters) sheet.addRow(q);
        sheet.addRow({});
        sheet.addRow({
          label: `FY${section.year}`,
          expected: section.expected,
          realised: section.realisedToDate,
        }).font = { bold: true };
        break;
      }
      case 'pillar_overview': {
        const sheet = sheetWith(workbook, 'Objectives', [
          { header: 'Code', key: 'code', width: 8 },
          { header: 'Objective', key: 'title', width: 40 },
          { header: 'Health', key: 'health', width: 12 },
          { header: 'Execution %', key: 'execution', width: 12 },
          { header: 'Impact %', key: 'impact', width: 12 },
        ]);
        for (const o of section.objectives)
          sheet.addRow({
            code: o.code,
            title: o.title,
            health: HEALTH_LABEL[o.health],
            execution: o.executionScore,
            impact: o.impactScore,
          });
        break;
      }
      case 'pillar_kpis': {
        const sheet = sheetWith(workbook, 'KPIs', [
          { header: 'Code', key: 'code', width: 8 },
          { header: 'KPI', key: 'name', width: 36 },
          { header: 'Objective', key: 'objective', width: 10 },
          { header: 'Unit', key: 'unit', width: 10 },
          { header: 'Baseline', key: 'baseline', width: 11 },
          { header: 'Target', key: 'target', width: 11 },
          { header: 'Latest', key: 'latest', width: 11 },
          { header: 'Trajectory', key: 'trajectory', width: 18 },
        ]);
        for (const k of section.kpis)
          sheet.addRow({
            code: k.code,
            name: k.name,
            objective: k.objective,
            unit: k.unit,
            baseline: k.baseline,
            target: k.target,
            latest: k.latestValue,
            trajectory: TRAJECTORY_LABEL[k.trajectory],
          });
        break;
      }
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function sheetWith(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Partial<ExcelJS.Column>[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = columns;
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: `FF${COLOURS.muted}` } };
  header.fill = fill(COLOURS.surface);
  return sheet;
}

function initiativeSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: PackInitiativeRow[],
) {
  const sheet = sheetWith(workbook, name, [
    { header: 'ID', key: 'code', width: 10 },
    { header: 'Initiative', key: 'title', width: 42 },
    { header: 'Pillar', key: 'pillar', width: 26 },
    { header: 'Owner', key: 'owner', width: 26 },
    { header: 'Health', key: 'health', width: 12 },
    { header: 'Verified %', key: 'verified', width: 11 },
    { header: 'Planned %', key: 'planned', width: 11 },
    { header: 'Gap (pp)', key: 'gap', width: 10 },
    { header: 'Impact %', key: 'impact', width: 10 },
    { header: 'Impact summary', key: 'summary', width: 36 },
  ]);
  for (const i of rows) {
    const row = sheet.addRow({
      code: i.code,
      title: i.title,
      pillar: i.pillar,
      owner: i.owner,
      health: HEALTH_LABEL[i.health],
      verified: i.verifiedProgress,
      planned: i.plannedProgress,
      gap: i.gapPp,
      impact: i.impactScore,
      summary: i.impactSummary,
    });
    row.getCell('health').fill = fill(COLOURS.health[i.health].fill);
  }
  sheet.autoFilter = { from: 'A1', to: 'J1' };
}
