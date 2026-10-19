import type { Role, Severity } from '../../generated/prisma/enums.js';
import type {
  EscalationLevelConfig,
  RulesetConfig,
} from '../rulesets/ruleset-config.js';

type Ladder = RulesetConfig['escalation'];

const DAY_MS = 86_400_000;

/**
 * Where a newly raised item starts: critical items skip to the ladder's
 * `criticalStartsAtLevel` (e.g. straight to the MD/CEO), everything else
 * starts at level 1.
 */
export function startLevel(
  severity: Severity,
  ladder: Ladder,
): { level: number; reason: 'RAISED' | 'CRITICAL_SEVERITY' } {
  const shortcut = ladder.criticalStartsAtLevel;
  if (severity === 'CRITICAL' && shortcut && shortcut > 1) {
    return {
      level: Math.min(shortcut, ladder.levels.length),
      reason: 'CRITICAL_SEVERITY',
    };
  }
  return { level: 1, reason: 'RAISED' };
}

/** One automatic move up the ladder and when it became due. */
export interface AutoStep {
  level: number;
  dueAt: Date;
}

/** Days a level's `autoEscalateAfterDays` sits after the level below it. */
const windowDays = (ladder: Ladder, level: number): number | null => {
  const next = ladder.levels.find((l) => l.level === level + 1);
  if (!next || next.autoEscalateAfterDays === null) return null;
  const current =
    ladder.levels.find((l) => l.level === level)?.autoEscalateAfterDays ?? 0;
  return Math.max(0, next.autoEscalateAfterDays - (current ?? 0));
};

/**
 * The automatic moves an unresolved item is owed by `now`. Each level gets
 * its full window, counted from when the item reached it: on the default
 * ladder (0 / 7 / 14 / manual) an item raised at level 1 moves to level 2
 * after 7 days and to level 3 a further 7 days later. Levels reached only by
 * decision (`autoEscalateAfterDays: null`) stop the climb. Counting from the
 * level change (not from raising) means an item moved down by decision gets
 * a fresh window instead of bouncing straight back up.
 *
 *   At level 1 since day 0, now day 16 → [{ level 2, day 7 }, { level 3, day 14 }]
 */
export function autoSteps(
  item: { level: number; levelChangedAt: Date },
  ladder: Ladder,
  now: Date,
): AutoStep[] {
  const steps: AutoStep[] = [];
  let level = item.level;
  let since = item.levelChangedAt;
  for (;;) {
    const days = windowDays(ladder, level);
    if (days === null) break;
    const dueAt = new Date(since.getTime() + days * DAY_MS);
    if (dueAt > now) break;
    level += 1;
    since = dueAt;
    steps.push({ level, dueAt });
  }
  return steps;
}

/** Whole days until the next automatic move, or null if none is coming. */
export function daysToNextLevel(
  item: { level: number; levelChangedAt: Date },
  ladder: Ladder,
  now: Date,
): number | null {
  const days = windowDays(ladder, item.level);
  if (days === null) return null;
  const dueAt = item.levelChangedAt.getTime() + days * DAY_MS;
  return Math.max(0, Math.ceil((dueAt - now.getTime()) / DAY_MS));
}

/** Who must decide at a level: a named person, a role, or both. */
export interface Decider {
  decisionFromId: string | null;
  decisionFromRole: Role | null;
}

/**
 * Resolves a level's `decidedBy` for one item. Owner and sponsor levels name
 * the initiative's people; a role level names the role, and the person too
 * when exactly one member holds it. Portfolio items (no initiative) at an
 * owner or sponsor level go to the Strategy Office.
 */
export function deciderFor(
  level: EscalationLevelConfig,
  initiative: { ownerId: string | null; sponsorId: string | null } | null,
  holdersOf: (role: Role) => string[],
): Decider {
  const decidedBy = level.decidedBy;
  if (decidedBy.type === 'ROLE') {
    const holders = holdersOf(decidedBy.role);
    return {
      decisionFromId: holders.length === 1 ? holders[0]! : null,
      decisionFromRole: decidedBy.role,
    };
  }
  if (!initiative) {
    return { decisionFromId: null, decisionFromRole: 'STRATEGY_OFFICE' };
  }
  const person =
    decidedBy.type === 'INITIATIVE_OWNER'
      ? initiative.ownerId
      : initiative.sponsorId;
  return person
    ? { decisionFromId: person, decisionFromRole: null }
    : // Nobody named yet: the Strategy Office picks it up.
      { decisionFromId: null, decisionFromRole: 'STRATEGY_OFFICE' };
}

/** True when the caller must decide at the item's current level. */
export function isDecider(
  caller: { membershipId: string; roles: readonly Role[] },
  item: Decider,
): boolean {
  // A role level is for anyone holding the role, named person or not.
  if (item.decisionFromRole && caller.roles.includes(item.decisionFromRole))
    return true;
  return item.decisionFromId === caller.membershipId;
}
