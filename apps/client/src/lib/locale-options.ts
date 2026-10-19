/** Choices for currency, time zone and month pickers, from the browser's own data. */

export const TIME_ZONES = Intl.supportedValuesOf('timeZone');

export const CURRENCIES = Intl.supportedValuesOf('currency');

const currencyNames = new Intl.DisplayNames(['en'], { type: 'currency' });

/** "NGN · Nigerian Naira" */
export const currencyLabel = (code: string) =>
  `${code} · ${currencyNames.of(code) ?? code}`;

/** "America/Port_of_Spain" → "America/Port of Spain" */
export const timeZoneLabel = (zone: string) => zone.replaceAll('_', ' ');

/** January … December. */
export const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, i, 1)),
  ),
);
