import { z } from 'zod';
import { Role } from './enums.js';

/**
 * The governance rules an organisation runs on, stored as `Ruleset.config`
 * (JSON) and versioned with maker-checker approval.
 *
 * Everything that differs between organisations lives here — RAG thresholds,
 * health modifiers, override policy, the escalation ladder and the reporting
 * cycle — so no organisation-specific rule is ever hard-coded.
 *
 * `schemaVersion` lets the shape evolve: add a new literal and a migration
 * function when the structure changes, never reinterpret old versions.
 */

/** Hard ceiling on ladder size; mirrored by a CHECK constraint in the database. */
export const MAX_ESCALATION_LEVELS = 10;

const day = z.int().min(1).max(31);

// ---------------------------------------------------------------------------
// RAG thresholds: percentage points behind planned completion
// ---------------------------------------------------------------------------

const ragSchema = z
  .object({
    /** Up to this many pp behind plan is Green. */
    greenMaxPpBehind: z.number().min(0).max(100),
    /** Up to this many pp behind plan is Amber; beyond is Red. */
    amberMaxPpBehind: z.number().min(0).max(100),
  })
  .refine((rag) => rag.amberMaxPpBehind > rag.greenMaxPpBehind, {
    message: 'The Amber limit must be greater than the Green limit',
    path: ['amberMaxPpBehind'],
  });

// ---------------------------------------------------------------------------
// Health modifiers: rules that override the pp-based result
// ---------------------------------------------------------------------------

const healthModifiersSchema = z.object({
  /** An overdue critical milestone forces Red regardless of progress. */
  overdueCriticalMilestoneForcesRed: z.boolean(),
  /** An open critical issue caps health at Amber. */
  openCriticalIssueCapsAtAmber: z.boolean(),
  /** A long-blocked dependency caps health at Amber. */
  blockedDependencyCapsAtAmber: z.object({
    enabled: z.boolean(),
    minDaysBlocked: z.int().min(1).max(365),
    criticalPathOnly: z.boolean(),
  }),
  /** A missed update shows "Unknown" instead of carrying a stale status forward. */
  missedUpdateMakesUnknown: z.boolean(),
});

// ---------------------------------------------------------------------------
// Manual health overrides
// ---------------------------------------------------------------------------

const overridesSchema = z.object({
  /** Overrides lapse automatically after this many days. */
  expiryDays: z.int().min(1).max(365),
  /** Lowest role allowed to override (roles above it may too). */
  minimumRole: z.enum(Role),
});

// ---------------------------------------------------------------------------
// Escalation ladder — any number of levels from 1 to MAX_ESCALATION_LEVELS
// ---------------------------------------------------------------------------

const deciderSchema = z.discriminatedUnion('type', [
  /** The owner of the initiative the item belongs to. */
  z.object({ type: z.literal('INITIATIVE_OWNER') }),
  /** The executive sponsor of that initiative. */
  z.object({ type: z.literal('INITIATIVE_SPONSOR') }),
  /** Anyone holding an organisation role, e.g. CEO or BOARD. */
  z.object({ type: z.literal('ROLE'), role: z.enum(Role) }),
]);

const escalationLevelSchema = z.object({
  level: z.int().min(1).max(MAX_ESCALATION_LEVELS),
  /** Shown on the escalation ladder, e.g. "Executive sponsor". */
  name: z.string().trim().min(1).max(60),
  /** e.g. "Unresolved after 7 days". */
  description: z.string().trim().max(200).optional(),
  decidedBy: deciderSchema,
  /**
   * Age in days (since the item was raised) at which an unresolved item
   * moves to this level automatically. Level 1 is always 0. `null` means the
   * level is reached only by an explicit decision (e.g. EXCO refers to Board).
   */
  autoEscalateAfterDays: z.int().min(0).max(365).nullable(),
});

const escalationSchema = z
  .object({
    levels: z.array(escalationLevelSchema).min(1).max(MAX_ESCALATION_LEVELS),
    /** Critical items start at this level instead of level 1 (null = no shortcut). */
    criticalStartsAtLevel: z.int().min(1).max(MAX_ESCALATION_LEVELS).nullable(),
  })
  .superRefine((ladder, ctx) => {
    const { levels } = ladder;

    levels.forEach((level, index) => {
      if (level.level !== index + 1) {
        ctx.addIssue({
          code: 'custom',
          message: 'Levels must be numbered 1, 2, 3… in order with no gaps',
          path: ['levels', index, 'level'],
        });
      }
    });

    if (levels[0] && levels[0].autoEscalateAfterDays !== 0) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Level 1 is where items start: its autoEscalateAfterDays must be 0',
        path: ['levels', 0, 'autoEscalateAfterDays'],
      });
    }

    // Automatic timings must increase, and once a level is manual-only,
    // every level above it is too (time cannot skip past a manual gate).
    let previousDays = 0;
    let manualFrom: number | null = null;
    levels.slice(1).forEach((level, offset) => {
      const index = offset + 1;
      const days = level.autoEscalateAfterDays;
      if (days === null) {
        manualFrom ??= index;
        return;
      }
      if (manualFrom !== null) {
        ctx.addIssue({
          code: 'custom',
          message:
            'A level above a manual-only level cannot escalate automatically',
          path: ['levels', index, 'autoEscalateAfterDays'],
        });
      } else if (days <= previousDays) {
        ctx.addIssue({
          code: 'custom',
          message: 'Each level must escalate later than the one below it',
          path: ['levels', index, 'autoEscalateAfterDays'],
        });
      }
      previousDays = days;
    });

    if (
      ladder.criticalStartsAtLevel !== null &&
      ladder.criticalStartsAtLevel > levels.length
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `criticalStartsAtLevel must be between 1 and ${levels.length}`,
        path: ['criticalStartsAtLevel'],
      });
    }
  });

// ---------------------------------------------------------------------------
// Reporting cycle — stage windows in working days from cycle start
// ---------------------------------------------------------------------------

const windowSchema = z
  .object({ fromDay: day, toDay: day })
  .refine((w) => w.toDay >= w.fromDay, {
    message: 'toDay must not be before fromDay',
    path: ['toDay'],
  });

const reportingCycleSchema = z
  .object({
    cadence: z.enum(['MONTHLY', 'QUARTERLY']),
    ownerSubmission: windowSchema,
    strategyReview: windowSchema,
    sponsorReview: windowSchema,
    reportIssueDay: day,
    /** Reminder e-mails/pushes, in working days before the submission deadline. */
    reminderDaysBeforeDue: z.array(z.int().min(0).max(20)).max(5),
  })
  .superRefine((cycle, ctx) => {
    const stages = [
      ['ownerSubmission', cycle.ownerSubmission],
      ['strategyReview', cycle.strategyReview],
      ['sponsorReview', cycle.sponsorReview],
    ] as const;
    for (let i = 1; i < stages.length; i++) {
      const [name, window] = stages[i];
      if (window.fromDay <= stages[i - 1][1].toDay) {
        ctx.addIssue({
          code: 'custom',
          message: 'Stages must follow each other without overlapping',
          path: [name, 'fromDay'],
        });
      }
    }
    if (cycle.reportIssueDay <= cycle.sponsorReview.toDay) {
      ctx.addIssue({
        code: 'custom',
        message: 'The report is issued after sponsor review ends',
        path: ['reportIssueDay'],
      });
    }
  });

// ---------------------------------------------------------------------------
// Strategic impact lens
// ---------------------------------------------------------------------------

const impactSchema = z
  .object({
    /** Below this % of expected impact, a delivered initiative is "not creating value". */
    lowValueThresholdPct: z.number().min(1).max(100),
    /**
     * KPI trajectory bands, in % of the way from baseline to the KPI's current
     * target: at or above `onTrajectoryMinPct` is on trajectory, at or above
     * `slightlyBehindMinPct` slightly behind, below it off trajectory. Added
     * after version 1 shipped, so stored rulesets without them get the defaults.
     */
    onTrajectoryMinPct: z.number().min(1).max(100).default(50),
    slightlyBehindMinPct: z.number().min(0).max(100).default(40),
  })
  .refine((impact) => impact.onTrajectoryMinPct > impact.slightlyBehindMinPct, {
    message: 'The on-trajectory level must be above the slightly-behind level',
    path: ['onTrajectoryMinPct'],
  });

// ---------------------------------------------------------------------------

export const rulesetConfigSchema = z.object({
  schemaVersion: z.literal(1),
  rag: ragSchema,
  healthModifiers: healthModifiersSchema,
  overrides: overridesSchema,
  escalation: escalationSchema,
  reportingCycle: reportingCycleSchema,
  impact: impactSchema,
});

export type RulesetConfig = z.infer<typeof rulesetConfigSchema>;
export type EscalationLevelConfig =
  RulesetConfig['escalation']['levels'][number];

/** Validates stored or submitted ruleset JSON; throws a ZodError listing every problem. */
export function parseRulesetConfig(input: unknown): RulesetConfig {
  return rulesetConfigSchema.parse(input);
}

/**
 * Sensible defaults for a new organisation (offered during onboarding,
 * then fully editable). Matches common practice: 5/15 pp RAG bands and a
 * four-level ladder ending at the Board.
 */
export const DEFAULT_RULESET_CONFIG: RulesetConfig = {
  schemaVersion: 1,
  rag: { greenMaxPpBehind: 5, amberMaxPpBehind: 15 },
  healthModifiers: {
    overdueCriticalMilestoneForcesRed: true,
    openCriticalIssueCapsAtAmber: true,
    blockedDependencyCapsAtAmber: {
      enabled: true,
      minDaysBlocked: 14,
      criticalPathOnly: true,
    },
    missedUpdateMakesUnknown: true,
  },
  overrides: { expiryDays: 30, minimumRole: 'EXECUTIVE_SPONSOR' },
  escalation: {
    levels: [
      {
        level: 1,
        name: 'Initiative owner',
        description: 'Resolve within 7 days',
        decidedBy: { type: 'INITIATIVE_OWNER' },
        autoEscalateAfterDays: 0,
      },
      {
        level: 2,
        name: 'Executive sponsor',
        description: 'Unresolved after 7 days',
        decidedBy: { type: 'INITIATIVE_SPONSOR' },
        autoEscalateAfterDays: 7,
      },
      {
        level: 3,
        name: 'MD/CEO · EXCO',
        description: 'Unresolved after 14 days or critical',
        decidedBy: { type: 'ROLE', role: 'CEO' },
        autoEscalateAfterDays: 14,
      },
      {
        level: 4,
        name: 'Board',
        description: 'Strategic plan impact, by EXCO decision',
        decidedBy: { type: 'ROLE', role: 'BOARD' },
        autoEscalateAfterDays: null,
      },
    ],
    criticalStartsAtLevel: 3,
  },
  reportingCycle: {
    cadence: 'MONTHLY',
    ownerSubmission: { fromDay: 1, toDay: 3 },
    strategyReview: { fromDay: 4, toDay: 5 },
    sponsorReview: { fromDay: 6, toDay: 7 },
    reportIssueDay: 8,
    reminderDaysBeforeDue: [2, 0],
  },
  impact: {
    lowValueThresholdPct: 50,
    onTrajectoryMinPct: 50,
    slightlyBehindMinPct: 40,
  },
};
