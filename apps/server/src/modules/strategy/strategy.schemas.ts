import { z } from 'zod';
import { MAX_FRAMEWORK_LEVELS } from '../../domain/strategy/framework.js';
import { FrameworkTemplate } from '../../generated/prisma/enums.js';

const isoDate = z.iso.date('Use a date like 2026-12-31');
const text = (max: number) => z.string().trim().min(1).max(max);
/** Optional long text: "" or null clears it. */
const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

const planDates = <T extends { startDate?: string; endDate?: string }>(
  plan: T,
) => !plan.startDate || !plan.endDate || plan.endDate >= plan.startDate;
const datesMessage = {
  message: 'The end date must be on or after the start date',
  path: ['endDate'],
};

export const createPlanSchema = z
  .object({
    name: text(120),
    startDate: isoDate,
    endDate: isoDate,
    template: z.enum(FrameworkTemplate).default('STRATEGIC_PILLARS'),
    vision: clearableText(1000).optional(),
    mission: clearableText(1000).optional(),
    values: z.array(text(80)).max(20).optional(),
    aspiration: clearableText(1000).optional(),
  })
  .refine(planDates, datesMessage);
export type CreatePlanInput = z.output<typeof createPlanSchema>;

export const updatePlanSchema = z
  .object({
    name: text(120),
    startDate: isoDate,
    endDate: isoDate,
    vision: clearableText(1000),
    mission: clearableText(1000),
    values: z.array(text(80)).max(20),
    aspiration: clearableText(1000),
  })
  .partial()
  .refine((plan) => Object.keys(plan).length > 0, 'Nothing to update')
  .refine(planDates, datesMessage);
export type UpdatePlanInput = z.output<typeof updatePlanSchema>;

export const levelsSchema = z.object({
  levels: z
    .array(
      z.object({
        id: z.uuid().optional(),
        label: text(60),
        pluralLabel: text(60),
        codePrefix: z
          .string()
          .trim()
          .toUpperCase()
          .regex(
            /^[A-Z][A-Z0-9]{0,4}$/,
            'Use 1–5 letters or digits, starting with a letter',
          ),
        allowsKpis: z.boolean(),
      }),
    )
    .min(1, 'Keep at least one level')
    .max(MAX_FRAMEWORK_LEVELS, `Use at most ${MAX_FRAMEWORK_LEVELS} levels`),
});
export type LevelsInput = z.output<typeof levelsSchema>;

const elementCode = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/,
    'Use up to 20 letters, digits, dots or hyphens',
  );

export const createElementSchema = z.object({
  /** Omit for a top-level element (e.g. a pillar). */
  parentId: z.uuid().optional(),
  title: text(200),
  description: clearableText(2000).optional(),
  /** Generated from the tree (P6, O6.1…) when omitted. */
  code: elementCode.optional(),
  ownerId: z.uuid().nullable().optional(),
  sponsorId: z.uuid().nullable().optional(),
});
export type CreateElementInput = z.output<typeof createElementSchema>;

export const updateElementSchema = z
  .object({
    title: text(200),
    description: clearableText(2000),
    code: elementCode,
    ownerId: z.uuid().nullable(),
    sponsorId: z.uuid().nullable(),
    /** Move under another element one level up (same plan). */
    parentId: z.uuid(),
    /** Position among siblings (0 = first). */
    sortOrder: z.int().min(0).max(10_000),
  })
  .partial()
  .refine((element) => Object.keys(element).length > 0, 'Nothing to update');
export type UpdateElementInput = z.output<typeof updateElementSchema>;

export const idSchema = z.uuid();
