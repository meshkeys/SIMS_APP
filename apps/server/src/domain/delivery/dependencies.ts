/**
 * Would adding "from depends on to" create a loop (A waits on B waits on A)?
 * A loop can never resolve, so such a dependency is refused. Returns the
 * loop as a list of ids (from → … → from) for the error message, or null.
 */
export function findDependencyCycle(
  existing: readonly { fromId: string; toId: string }[],
  fromId: string,
  toId: string,
): string[] | null {
  if (fromId === toId) return [fromId, fromId];
  const next = new Map<string, string[]>();
  for (const edge of existing) {
    next.set(edge.fromId, [...(next.get(edge.fromId) ?? []), edge.toId]);
  }

  // Search from `to` for a path back to `from`.
  const stack: string[][] = [[toId]];
  const seen = new Set<string>();
  while (stack.length) {
    const path = stack.pop()!;
    const node = path.at(-1)!;
    if (node === fromId) return [fromId, ...path];
    if (seen.has(node)) continue;
    seen.add(node);
    for (const target of next.get(node) ?? []) stack.push([...path, target]);
  }
  return null;
}
