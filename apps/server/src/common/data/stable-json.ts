/**
 * JSON with object keys sorted, for comparing values regardless of key order.
 * PostgreSQL `jsonb` does not preserve key order, so a value read back from
 * the database never stringifies the same as the object that was written.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)),
        )
      : inner,
  );
}
