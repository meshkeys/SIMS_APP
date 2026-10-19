import type { Health, RegisterItem } from '@sims/contracts';
import ExcelJS from 'exceljs';

const HEALTH: Record<Health, { label: string; fill: string }> = {
  GREEN: { label: 'On track', fill: 'FFE3EFE6' },
  AMBER: { label: 'At risk', fill: 'FFFBEFD4' },
  RED: { label: 'Delayed', fill: 'FFF8E1DE' },
  UNKNOWN: { label: 'Unknown', fill: 'FFECEBE6' },
};

export interface RegisterWorkbookMeta {
  organisation: string;
  exportedBy: string;
  /** Already formatted in the organisation's time zone. */
  exportedAt: string;
  /** Plain-language filters, e.g. "Active · Delayed · search “core”". */
  filters: string;
  total: number;
  truncated: boolean;
}

/** A calendar date ("2026-10-15") as an Excel date (midnight UTC, no time shift). */
const excelDate = (date: string | null) =>
  date ? new Date(`${date}T00:00:00Z`) : null;

/**
 * The register as an .xlsx workbook: one row per initiative, typed cells
 * (dates are dates, percentages are numbers) so people can sort, filter and
 * chart it, plus an "About" sheet saying what the file contains.
 */
export async function buildRegisterWorkbook(
  items: RegisterItem[],
  meta: RegisterWorkbookMeta,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Register', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'ID', key: 'code', width: 11 },
    { header: 'Initiative', key: 'title', width: 42 },
    { header: 'Pillar', key: 'pillar', width: 26 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Owner', key: 'owner', width: 22 },
    { header: 'Owner role', key: 'ownerTitle', width: 26 },
    { header: 'Sponsor', key: 'sponsor', width: 22 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Due', key: 'due', width: 12, style: { numFmt: 'dd mmm yyyy' } },
    {
      header: 'Forecast end',
      key: 'forecast',
      width: 13,
      style: { numFmt: 'dd mmm yyyy' },
    },
    {
      header: 'Verified %',
      key: 'verified',
      width: 11,
      style: { numFmt: '0.0' },
    },
    {
      header: 'Planned %',
      key: 'planned',
      width: 11,
      style: { numFmt: '0.0' },
    },
    {
      header: 'Variance (pp)',
      key: 'variance',
      width: 13,
      style: { numFmt: '+0.0;-0.0;0.0' },
    },
    { header: 'Health', key: 'health', width: 11 },
    { header: 'Overridden', key: 'overridden', width: 11 },
    { header: 'Impact', key: 'impact', width: 30 },
    {
      header: 'Impact score %',
      key: 'impactScore',
      width: 14,
      style: { numFmt: '0.0' },
    },
    {
      header: 'Last update',
      key: 'lastUpdate',
      width: 13,
      style: { numFmt: 'dd mmm yyyy' },
    },
    { header: 'Update overdue', key: 'overdue', width: 15 },
    { header: 'Restricted', key: 'restricted', width: 11 },
  ];

  for (const item of items) {
    const row = sheet.addRow({
      code: item.code,
      title: item.title,
      pillar: item.pillar?.title ?? '',
      status: item.status.replace('_', ' ').toLowerCase(),
      owner: item.owner?.name ?? '',
      ownerTitle: item.owner?.jobTitle ?? '',
      sponsor: item.sponsor?.name ?? '',
      department: item.department?.name ?? '',
      due: excelDate(item.dueDate),
      forecast: excelDate(item.forecastEnd),
      verified: item.verifiedProgress,
      planned: item.plannedProgress,
      variance: item.variancePp,
      health: HEALTH[item.health].label,
      overridden: item.overridden ? 'Yes' : '',
      impact:
        item.impactSummary ??
        (item.impactScore === null ? 'Not yet measurable' : ''),
      impactScore: item.impactScore,
      lastUpdate: item.lastUpdateAt ? new Date(item.lastUpdateAt) : null,
      overdue: item.updateOverdue ? 'Yes' : '',
      restricted: item.isSensitive ? 'Yes' : '',
    });
    row.getCell('health').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEALTH[item.health].fill },
    };
  }

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle' };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF4F3EF' },
  };
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };

  const about = workbook.addWorksheet('About');
  about.columns = [{ width: 18 }, { width: 80 }];
  about.addRows([
    ['Initiative register', meta.organisation],
    ['Exported', meta.exportedAt],
    ['Exported by', meta.exportedBy],
    ['Filters', meta.filters],
    [
      'Rows',
      meta.truncated
        ? `${items.length} of ${meta.total} (limit reached)`
        : String(items.length),
    ],
    [],
    [
      'Note',
      'Restricted initiatives you are not allowed to see are not included. Verified % is weighted milestone completion verified by the Strategy Office; Planned % is where the baseline says it should be today.',
    ],
  ]);
  about.getColumn(1).font = { bold: true };
  about.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
