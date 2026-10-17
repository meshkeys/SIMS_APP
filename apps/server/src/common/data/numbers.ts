/** Anything Prisma returns for a Decimal column. */
type DecimalLike = { toNumber(): number } | number | string;

/**
 * Decimal → JSON number. Prisma returns Decimal objects (which serialise as
 * strings); the API always sends plain numbers. Percentages and scores fit
 * comfortably in a double; money is sent the same way and formatted by the client.
 */
export function toNumber(value: DecimalLike): number;
export function toNumber(value: DecimalLike | null | undefined): number | null;
export function toNumber(value: DecimalLike | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return value.toNumber();
}

/** Date-only column → "YYYY-MM-DD". */
export function toIsoDate(value: Date): string;
export function toIsoDate(value: Date | null | undefined): string | null;
export function toIsoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
