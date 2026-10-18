import {
  calculateHealth,
  type HealthResult,
} from '../../../src/domain/delivery/health.js';
import {
  plannedCompletion,
  verifiedCompletion,
} from '../../../src/domain/delivery/progress.js';
import type { RulesetConfig } from '../../../src/domain/rulesets/ruleset-config.js';
import { DEPENDENCIES, ISSUES } from './governance.js';
import {
  ALL_INITIATIVES,
  type InitiativeSpec,
  OCTOBER_UPDATE_STATE,
} from './initiatives.js';
import { AS_OF, date, generateMilestones, type MilestoneSeed } from './lib.js';

/** "Today" as the engine sees it (start of the UTC day). */
export const TODAY = date('2026-10-16');
const DAY_MS = 86_400_000;

export interface ComputedDelivery {
  /** Baseline start used for milestone windows and history. */
  start: Date;
  milestones: MilestoneSeed[];
  verified: number;
  /** Planned completion today, from the milestone windows (rules engine). */
  planned: number;
  /** Health from the rules engine (active initiatives only). */
  health: HealthResult | null;
}

/**
 * For generated milestones, choose the start date so that planned progress
 * today equals the wireframe figure: phases are laid out in proportion to
 * their weights, so planned % = share of the window elapsed.
 */
function startForPlanned(spec: InitiativeSpec): Date {
  const isActive = (spec.status ?? 'ACTIVE') === 'ACTIVE';
  if (
    !isActive ||
    spec.milestones ||
    spec.planned <= 0 ||
    spec.planned >= 100
  ) {
    return date(spec.start);
  }
  const p = spec.planned / 100;
  const end = date(spec.end).getTime();
  const start = (TODAY.getTime() - p * end) / (1 - p);
  return new Date(Math.round(start / DAY_MS) * DAY_MS);
}

const titleOf = new Map(ALL_INITIATIVES.map((spec) => [spec.code, spec.title]));

/** Runs the real rules engine over the demo data. */
export function computeDelivery(
  spec: InitiativeSpec,
  rules: RulesetConfig,
): ComputedDelivery {
  const start = startForPlanned(spec);
  const milestones =
    spec.milestones ??
    generateMilestones({
      start,
      end: date(spec.end),
      progress: spec.progress,
      health: spec.health,
    });

  const verified = verifiedCompletion(milestones);
  const planned = milestones.length
    ? plannedCompletion(milestones, TODAY, start)
    : 0;
  const isActive = (spec.status ?? 'ACTIVE') === 'ACTIVE';

  const health = isActive
    ? calculateHealth(
        {
          plannedProgress: planned,
          verifiedProgress: verified,
          criticalMilestones: milestones
            .filter((m) => m.isCritical)
            .map((m) => ({
              title: m.title,
              baselineDate: m.baselineDate,
              complete: m.status === 'COMPLETE',
            })),
          openCriticalIssues: ISSUES.filter(
            (issue) =>
              issue.initiative === spec.code && issue.severity === 'CRITICAL',
          ).map((issue) => ({ title: issue.title })),
          blockedDependencies: DEPENDENCIES.filter(
            (d) => d.from === spec.code && d.status === 'BLOCKED',
          ).map((d) => ({
            title: `${d.to} ${titleOf.get(d.to)}`,
            blockedSince: date((d as { blockedSince: string }).blockedSince),
            isCriticalPath: d.isCriticalPath,
          })),
          // Every active initiative has a September update (see seed-demo).
          missedUpdate: null,
          // October submissions closed on 10 Oct; these owners have not submitted.
          overdueUpdate: (
            OCTOBER_UPDATE_STATE.notSubmitted as readonly string[]
          ).includes(spec.code)
            ? {
                periodName: 'October 2026',
                dueAt: new Date('2026-10-10T16:00:00Z'),
              }
            : null,
          today: AS_OF,
        },
        rules,
      )
    : null;

  return { start, milestones, verified, planned, health };
}

/** Problems where the engine's result disagrees with the wireframe figures. */
export function deliveryProblems(
  spec: InitiativeSpec,
  computed: ComputedDelivery,
): string[] {
  const problems: string[] = [];
  if (
    computed.milestones.length &&
    Math.abs(computed.verified - spec.progress) > 0.01
  ) {
    problems.push(
      `${spec.code}: milestones give ${computed.verified}% verified, wireframe says ${spec.progress}%`,
    );
  }
  if (computed.health) {
    if (Math.abs(computed.planned - spec.planned) >= 0.5) {
      problems.push(
        `${spec.code}: milestones plan ${computed.planned}% for today, wireframe says ${spec.planned}%`,
      );
    }
    if (computed.health.health !== spec.health) {
      problems.push(
        `${spec.code}: rules engine says ${computed.health.health}, wireframe says ${spec.health} ` +
          `(${computed.health.reasons.map((r) => r.detail).join('; ')})`,
      );
    }
  }
  return problems;
}
