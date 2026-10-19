/**
 * Display formatting. Calendar dates ("2026-10-22") are dates, not instants,
 * so they are formatted as written; instants (deadlines, timestamps) are shown
 * in the organisation's time zone, so everyone sees the same deadline.
 */

const LOCALE = 'en-GB';

const dateFormat = (options: Intl.DateTimeFormatOptions, timeZone = 'UTC') =>
  new Intl.DateTimeFormat(LOCALE, { timeZone, ...options });

/** "2026-10-22" → Date at midnight UTC (safe for formatting with timeZone UTC). */
const fromIsoDate = (date: string) => new Date(`${date}T00:00:00Z`);

/** "22 Oct 2026" */
export function formatDate(date: string): string {
  return dateFormat({ day: 'numeric', month: 'short', year: 'numeric' }).format(
    fromIsoDate(date),
  );
}

/** "22 Oct" */
export function formatDayMonth(date: string): string {
  return dateFormat({ day: 'numeric', month: 'short' }).format(
    fromIsoDate(date),
  );
}

/** { day: "22", month: "OCT" } for date blocks. */
export function dateParts(date: string): { day: string; month: string } {
  const d = fromIsoDate(date);
  return {
    day: dateFormat({ day: 'numeric' }).format(d),
    month: dateFormat({ month: 'short' }).format(d).toUpperCase(),
  };
}

/** An instant as a day in the organisation's zone: "17 Oct". */
export function formatInstantDay(iso: string, timeZone: string): string {
  return dateFormat({ day: 'numeric', month: 'short' }, timeZone).format(
    new Date(iso),
  );
}

/** An instant as a full date in the organisation's zone: "12 Jan 2026". */
export function formatInstantDate(iso: string, timeZone: string): string {
  return dateFormat(
    { day: 'numeric', month: 'short', year: 'numeric' },
    timeZone,
  ).format(new Date(iso));
}

/** "Fri 17 Oct, 5:00 pm" in the organisation's zone. */
export function formatDeadline(iso: string, timeZone: string): string {
  return dateFormat(
    {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    },
    timeZone,
  ).format(new Date(iso));
}

/** 65.6 → "66%"; null → "—" */
export function formatPercent(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** 1 → "1 day", 3 → "3 days" */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

const CURRENCY_SCALE = /^([A-Z]{3}) ?(k|m|bn)?$/;
const ATTACHED_UNITS = new Set(['%', 'h', 'pp']);
const BARE_UNITS = new Set(['score', 'index', 'ratio', '']);

/** Trims trailing zeros: 4.20 → "4.2", 30 → "30". */
const num = (value: number) =>
  new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(value);

/**
 * A KPI value with its unit, written the way people say it:
 * 18 "%" → "18%", 72 "h" → "72h", 4.2 "NGN bn" → "₦4.2bn",
 * 1.5 "m users" → "1.5m users", 40 "clients" → "40 clients",
 * 1 "days" → "1 day", 22 "score" → "22".
 */
export function formatKpiValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  if (ATTACHED_UNITS.has(unit)) return `${num(value)}${unit}`;
  if (BARE_UNITS.has(unit)) return num(value);
  const currency = CURRENCY_SCALE.exec(unit);
  if (currency) {
    return `${currencySymbol(currency[1]!)}${num(value)}${currency[2] ?? ''}`;
  }
  const scaled = /^(k|m|bn) (.+)$/.exec(unit);
  if (scaled) return `${num(value)}${scaled[1]} ${scaled[2]}`;
  const word = value === 1 && unit.endsWith('s') ? unit.slice(0, -1) : unit;
  return `${num(value)} ${word}`;
}

/** 50000000 "NGN" → "₦50m", 1.25e9 → "₦1.3bn"; compact, in the organisation's currency. */
export function formatMoney(value: number | null, currency: string): string {
  if (value === null) return '—';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/** "NGN" → "₦", "USD" → "$"; the code itself when there is no symbol. */
export function currencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value ?? `${currency} `
  );
}

/** 412331 → "403 KB", 2_500_000 → "2.4 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
