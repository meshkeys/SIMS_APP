/**
 * True for a Prisma unique-constraint violation (P2002) that mentions
 * `field`. Matching on the serialised metadata works across driver adapters,
 * whose `meta` shapes differ.
 */
export function isUniqueViolation(error: unknown, field: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: unknown };
  return code === 'P2002' && JSON.stringify(meta ?? {}).includes(field);
}
