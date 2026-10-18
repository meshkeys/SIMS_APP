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
