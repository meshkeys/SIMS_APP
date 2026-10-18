import type { Health } from '../../generated/prisma/enums.js';
import type { RulesetConfig } from '../rulesets/ruleset-config.js';

/**
 * Rolls initiative delivery and KPI results up the strategy tree, so every
 * pillar and objective has an execution score, an impact score and a health.
 *
 *   execution = Σ(weight × verified) ÷ Σ(weight × planned), capped at 100
 *               — "how much of what was planned by today has been delivered"
 *   health    = the weighted average pp behind plan, banded with the
 *               organisation's own RAG thresholds (same rules as initiatives)
 *   impact    = average % to target of the KPIs at or below the element,
 *               each clamped to 0–100
 *
 * An initiative counts for every element it is linked to and all of their
 * ancestors, weighted by its contribution. Only active initiatives count.
 */

export interface RollupElement {
  id: string;
  parentId: string | null;
}

export interface RollupLink {
  elementId: string;
  initiativeId: string;
  weight: number;
}

export interface RollupInitiative {
  verified: number;
  planned: number;
}

export interface RollupKpi {
  elementId: string;
  /** % of the way to target; null if not measurable. */
  progress: number | null;
}

export interface ElementRollup {
  executionScore: number | null;
  impactScore: number | null;
  health: Health;
  /** Weighted average percentage points behind plan (negative = ahead). */
  ppBehind: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => Math.min(100, Math.max(0, n));

export function rollupElements(
  elements: readonly RollupElement[],
  links: readonly RollupLink[],
  initiatives: ReadonlyMap<string, RollupInitiative>,
  kpis: readonly RollupKpi[],
  rules: RulesetConfig,
): Map<string, ElementRollup> {
  const parentOf = new Map(elements.map((e) => [e.id, e.parentId]));
  /** The element and all its ancestors. */
  const lineage = (id: string) => {
    const chain: string[] = [];
    for (
      let node: string | null | undefined = id;
      node;
      node = parentOf.get(node)
    )
      chain.push(node);
    return chain;
  };

  const delivery = new Map<
    string,
    { weight: number; verified: number; planned: number }
  >();
  for (const link of links) {
    const initiative = initiatives.get(link.initiativeId);
    if (!initiative || link.weight <= 0) continue;
    for (const id of lineage(link.elementId)) {
      const sum = delivery.get(id) ?? { weight: 0, verified: 0, planned: 0 };
      sum.weight += link.weight;
      sum.verified += link.weight * initiative.verified;
      sum.planned += link.weight * initiative.planned;
      delivery.set(id, sum);
    }
  }

  const impact = new Map<string, { total: number; count: number }>();
  for (const kpi of kpis) {
    if (kpi.progress === null) continue;
    for (const id of lineage(kpi.elementId)) {
      const sum = impact.get(id) ?? { total: 0, count: 0 };
      sum.total += clamp(kpi.progress);
      sum.count += 1;
      impact.set(id, sum);
    }
  }

  const { greenMaxPpBehind, amberMaxPpBehind } = rules.rag;
  const result = new Map<string, ElementRollup>();
  for (const element of elements) {
    const d = delivery.get(element.id);
    const i = impact.get(element.id);
    const ppBehind =
      d && d.weight > 0 ? round2((d.planned - d.verified) / d.weight) : null;
    result.set(element.id, {
      executionScore:
        d && d.planned > 0
          ? round2(clamp((d.verified / d.planned) * 100))
          : d
            ? 100
            : null,
      impactScore: i ? round2(i.total / i.count) : null,
      ppBehind,
      health:
        ppBehind === null
          ? 'UNKNOWN'
          : ppBehind <= greenMaxPpBehind
            ? 'GREEN'
            : ppBehind <= amberMaxPpBehind
              ? 'AMBER'
              : 'RED',
    });
  }
  return result;
}

/** Delivery-vs-value quadrant of an active initiative. */
export type ValueQuadrant =
  | 'ON_PLAN_VALUE_OK'
  | 'ON_PLAN_VALUE_LOW'
  | 'BEHIND_VALUE_OK'
  | 'BEHIND_VALUE_LOW'
  | 'NOT_MEASURABLE';

/**
 * On plan = effective health Green. Value on track = impact at or above the
 * organisation's low-value threshold. No impact figure yet = not measurable.
 */
export function valueQuadrant(
  health: Health,
  impactScore: number | null,
  lowValueThresholdPct: number,
): ValueQuadrant {
  if (impactScore === null) return 'NOT_MEASURABLE';
  const onPlan = health === 'GREEN';
  const valueOk = impactScore >= lowValueThresholdPct;
  if (onPlan) return valueOk ? 'ON_PLAN_VALUE_OK' : 'ON_PLAN_VALUE_LOW';
  return valueOk ? 'BEHIND_VALUE_OK' : 'BEHIND_VALUE_LOW';
}
