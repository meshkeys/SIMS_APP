import type { Health, Trajectory } from '@sims/contracts';

/** How packs write figures: the same conventions as the web app. */
const LOCALE = 'en-GB';

export const HEALTH_LABEL: Record<Health, string> = {
  GREEN: 'On track',
  AMBER: 'At risk',
  RED: 'Delayed',
  UNKNOWN: 'Unknown',
};

/** Brand colours, matching the web app's tokens. */
export const COLOURS = {
  ink: '1D1C1A',
  muted: '5C5A54',
  border: 'E6E3DC',
  surface: 'F8F7F4',
  primary: '1F3A5C',
  impact: 'C9862C',
  expected: 'D2CEC4',
  health: {
    GREEN: { fill: 'E3EFE6', text: '24663F' },
    AMBER: { fill: 'FBEFD4', text: '7A4F00' },
    RED: { fill: 'F8E1DE', text: '9B2C25' },
    UNKNOWN: { fill: 'ECEBE6', text: '4C4A45' },
  } satisfies Record<Health, { fill: string; text: string }>,
};

export const TRAJECTORY_LABEL: Record<Trajectory, string> = {
  ON_TRAJECTORY: 'On trajectory',
  SLIGHTLY_BEHIND: 'Slightly behind',
  OFF_TRAJECTORY: 'Off trajectory',
  NOT_MEASURABLE: 'Not yet measurable',
};

/** 65.4 → "65%"; null → "—" */
export const percent = (value: number | null) =>
  value === null ? '—' : `${Math.round(value)}%`;

/** −9 → "−9 pp", 3.5 → "+3.5 pp" */
export const pp = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)} pp`;

/** 4.2e9 NGN → "₦4.2bn" */
export function money(value: number | null, currency: string): string {
  if (value === null) return '—';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/** A KPI value with its unit: 23 "%" → "23%", 86 "clients" → "86 clients". */
export function kpiValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  const n = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(
    value,
  );
  if (unit === '%' || unit === 'h' || unit === 'pp') return `${n}${unit}`;
  if (['score', 'index', 'ratio', ''].includes(unit)) return n;
  return `${n} ${unit}`;
}

/** "2026-10-08T11:00:00Z" → "8 Oct 2026" */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** Splits rows into pages of `size` (at least one page). */
export function pages<T>(rows: readonly T[], size: number): T[][] {
  if (rows.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
