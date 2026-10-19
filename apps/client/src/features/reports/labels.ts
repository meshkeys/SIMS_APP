import type { ReportFormatKey, ReportSnapshot } from '@sims/contracts';
import { formatInstantDay } from '@/lib/format';

export const FORMAT_LABEL: Record<ReportFormatKey, string> = {
  PDF: 'PDF',
  PPTX: 'PowerPoint',
  XLSX: 'Excel data appendix',
};

/** Short names for lists ("PDF, PPTX"). */
export const FORMAT_SHORT: Record<ReportFormatKey, string> = {
  PDF: 'PDF',
  PPTX: 'PPTX',
  XLSX: 'XLSX',
};

/** "Q3 2026 · locked 8 Oct" (the quarter when the period ends one). */
export function snapshotLabel(
  snapshot: ReportSnapshot,
  timeZone: string,
): string {
  return `${snapshot.quarter ?? snapshot.period} · locked ${formatInstantDay(snapshot.lockedAt, timeZone)}`;
}
