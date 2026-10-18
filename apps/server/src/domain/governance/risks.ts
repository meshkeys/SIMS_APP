import type { Severity } from '../../generated/prisma/enums.js';

/**
 * Risk severity from likelihood × impact (each 1–5), as on the heatmap:
 * 15+ critical, 10+ high, 5+ medium, below that low. Issues (things already
 * happening) have no likelihood; their severity is set directly.
 */
export function severityFor(likelihood: number, impact: number): Severity {
  const score = likelihood * impact;
  return score >= 15
    ? 'CRITICAL'
    : score >= 10
      ? 'HIGH'
      : score >= 5
        ? 'MEDIUM'
        : 'LOW';
}

/**
 * The 5×5 heatmap: rows by impact from 5 (top) to 1, columns by likelihood
 * from 1 to 5 — the orientation of the Escalation centre screen.
 */
export function heatmap(
  risks: readonly { likelihood: number | null; impact: number | null }[],
): number[][] {
  const grid = Array.from({ length: 5 }, () => Array<number>(5).fill(0));
  for (const risk of risks) {
    if (!risk.likelihood || !risk.impact) continue;
    grid[5 - risk.impact][risk.likelihood - 1] += 1;
  }
  return grid;
}
