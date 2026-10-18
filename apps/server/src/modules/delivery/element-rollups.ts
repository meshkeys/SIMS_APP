import { toNumber } from '../../common/data/numbers.js';
import {
  DEFAULT_RULESET_CONFIG,
  parseRulesetConfig,
  type RulesetConfig,
} from '../../domain/rulesets/ruleset-config.js';
import { rollupElements } from '../../domain/strategy/rollup.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { kpiTargetsInclude, toKpiSummary } from '../kpis/kpi-view.js';

/** The organisation's active rules (defaults if none is active yet). */
export async function loadActiveRules(
  tx: Prisma.TransactionClient,
): Promise<{ version: number | null; config: RulesetConfig }> {
  const active = await tx.ruleset.findFirst({
    where: { status: 'ACTIVE' },
    select: { version: true, config: true },
  });
  return active
    ? { version: active.version, config: parseRulesetConfig(active.config) }
    : { version: null, config: DEFAULT_RULESET_CONFIG };
}

/**
 * Recalculates and stores every element's execution score, impact score and
 * health for one plan (see domain/strategy/rollup.ts). Shared by the API
 * (after each health recalculation) and the demo seed, so both always agree.
 * Returns how many elements changed.
 */
export async function recalculateElementRollups(
  tx: Prisma.TransactionClient,
  planId: string,
  rules: RulesetConfig,
  now: Date,
): Promise<number> {
  // Sequential on purpose: a transaction is one connection.
  const elements = await tx.strategyElement.findMany({
    where: { planId },
    select: {
      id: true,
      parentId: true,
      executionScore: true,
      impactScore: true,
      health: true,
    },
  });
  const links = await tx.initiativeObjectiveLink.findMany({
    where: { element: { planId }, initiative: { status: 'ACTIVE' } },
    select: {
      elementId: true,
      initiativeId: true,
      contributionWeight: true,
      initiative: {
        select: { verifiedProgress: true, plannedProgress: true },
      },
    },
  });
  const kpis = await tx.kpi.findMany({
    where: { element: { planId } },
    include: kpiTargetsInclude,
  });

  const initiatives = new Map(
    links.map((link) => [
      link.initiativeId,
      {
        verified: toNumber(link.initiative.verifiedProgress),
        planned: toNumber(link.initiative.plannedProgress),
      },
    ]),
  );
  const result = rollupElements(
    elements,
    links.map((link) => ({
      elementId: link.elementId,
      initiativeId: link.initiativeId,
      weight: toNumber(link.contributionWeight),
    })),
    initiatives,
    kpis.map((kpi) => ({
      elementId: kpi.elementId,
      progress: toKpiSummary(kpi, now).progressToTarget,
    })),
    rules,
  );

  let changed = 0;
  for (const element of elements) {
    const next = result.get(element.id)!;
    if (
      toNumber(element.executionScore) === next.executionScore &&
      toNumber(element.impactScore) === next.impactScore &&
      element.health === next.health
    ) {
      continue;
    }
    changed += 1;
    await tx.strategyElement.update({
      where: { id: element.id },
      data: {
        executionScore: next.executionScore,
        impactScore: next.impactScore,
        health: next.health,
        rolledUpAt: now,
      },
    });
  }
  return changed;
}
