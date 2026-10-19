import { z } from 'zod';
import { isoDateTime, personRefSchema } from './common.js';
import { Health, RulesetStatus, Trajectory } from './enums.js';
import { rulesetConfigSchema } from './rulesets.js';

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const rulesetPreviewSchema = z.object({ config: rulesetConfigSchema });
export type RulesetPreviewInput = z.output<typeof rulesetPreviewSchema>;

export const proposeRulesetSchema = z.object({
  config: rulesetConfigSchema,
  /** Why the rules should change; shown to the MD/CEO with the decision. */
  changeSummary: z
    .string()
    .trim()
    .min(10, 'Explain the change in at least 10 characters')
    .max(500),
});
export type ProposeRulesetInput = z.output<typeof proposeRulesetSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const rulesetViewSchema = z.object({
  /** Null for the built-in defaults of an organisation that never saved rules. */
  id: z.uuid().nullable(),
  version: z.int().nullable(),
  status: z.enum(RulesetStatus),
  config: rulesetConfigSchema,
  changeSummary: z.string().nullable(),
  /** What differs from the rules that were active when it was proposed (plain words). */
  changes: z.array(z.string()),
  proposedBy: personRefSchema.nullable(),
  approvedBy: personRefSchema.nullable(),
  /** When it took effect (active and superseded versions). */
  effectiveFrom: isoDateTime.nullable(),
  createdAt: isoDateTime.nullable(),
  /** The MD/CEO's decision for a pending version. */
  decisionId: z.uuid().nullable(),
  can: z.object({ withdraw: z.boolean() }),
});
export type RulesetView = z.infer<typeof rulesetViewSchema>;

export const rulesetsOverviewSchema = z.object({
  active: rulesetViewSchema,
  /** At most one proposal waits for approval at a time. */
  pending: rulesetViewSchema.nullable(),
  /** Every saved version, newest first. */
  history: z.array(rulesetViewSchema),
  can: z.object({ propose: z.boolean() }),
});
export type RulesetsOverview = z.infer<typeof rulesetsOverviewSchema>;

const healthCounts = z.object({
  GREEN: z.int().min(0),
  AMBER: z.int().min(0),
  RED: z.int().min(0),
  UNKNOWN: z.int().min(0),
});
const trajectoryCounts = z.object({
  ON_TRAJECTORY: z.int().min(0),
  SLIGHTLY_BEHIND: z.int().min(0),
  OFF_TRAJECTORY: z.int().min(0),
  NOT_MEASURABLE: z.int().min(0),
});

/** What the proposed rules would change on today's portfolio. */
export const rulesetImpactSchema = z.object({
  /** The proposal in plain words, against the live rules. */
  changes: z.array(z.string()),
  health: z.object({
    /** Active initiatives assessed. */
    initiatives: z.int().min(0),
    live: healthCounts,
    proposed: healthCounts,
    /** Initiatives whose status would change (manual overrides still apply). */
    changes: z.array(
      z.object({
        code: z.string(),
        title: z.string(),
        from: z.enum(Health),
        to: z.enum(Health),
      }),
    ),
  }),
  kpis: z.object({
    live: trajectoryCounts,
    proposed: trajectoryCounts,
    changes: z.array(
      z.object({
        code: z.string(),
        name: z.string(),
        from: z.enum(Trajectory),
        to: z.enum(Trajectory),
      }),
    ),
  }),
  lowValue: z.object({ live: z.int().min(0), proposed: z.int().min(0) }),
});
export type RulesetImpact = z.infer<typeof rulesetImpactSchema>;
