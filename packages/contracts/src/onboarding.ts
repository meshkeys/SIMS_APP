import { z } from 'zod';
import { organisationSettingsSchema } from './admin.js';
import { clearableText, isoDate } from './common.js';
import {
  CustomFieldEntity,
  CustomFieldType,
  FrameworkTemplate,
  OrganisationSector,
  OrganisationStatus,
} from './enums.js';
import { INVITER_ROLES } from './roles.js';
import { rulesetConfigSchema } from './rulesets.js';
import { levelsSchema, levelViewSchema } from './strategy.js';

/** Roles that set up a workspace: the founder holds both. */
export const ONBOARDING_ROLES = INVITER_ROLES;

/** The wizard's steps, in order; `step` in the state is the last one saved (1–5). */
export const ONBOARDING_STEPS = [
  'organisation',
  'framework',
  'vision',
  'governance',
  'team',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const term = z.string().trim().min(2, 'Use at least 2 characters').max(40);
const text = (max: number) => z.string().trim().min(1).max(max);

// ---------------------------------------------------------------------------
// Requests, one per step
// ---------------------------------------------------------------------------

/** Step 1: what sign-up asked, editable, plus the financial year. */
export const onboardingOrganisationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sector: z.enum(OrganisationSector),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter country code, e.g. NG'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code, e.g. NGN'),
  timezone: z.string().trim().min(3).max(60),
  fiscalYearStartMonth: z.int().min(1).max(12),
});
export type OnboardingOrganisationInput = z.output<
  typeof onboardingOrganisationSchema
>;

/**
 * Step 2: a starting framework, the strategy levels (renamed, added,
 * removed) and what KPIs, initiatives, milestones and tasks are called.
 */
export const onboardingFrameworkSchema = z.object({
  template: z.enum(FrameworkTemplate),
  levels: levelsSchema.shape.levels,
  terminology: z.object({
    kpi: term,
    initiative: term,
    milestone: term,
    task: term,
  }),
});
export type OnboardingFrameworkInput = z.output<
  typeof onboardingFrameworkSchema
>;

/** Step 3: the plan period and its statements. */
export const onboardingVisionSchema = z
  .object({
    name: text(120),
    startDate: isoDate,
    endDate: isoDate,
    vision: clearableText(1000),
    mission: clearableText(1000),
    values: z.array(text(80)).max(20),
    aspiration: clearableText(1000),
  })
  .refine((plan) => plan.endDate >= plan.startDate, {
    message: 'The end date must be on or after the start date',
    path: ['endDate'],
  });
export type OnboardingVisionInput = z.output<typeof onboardingVisionSchema>;

/** Step 4: the starting rules. Applied directly: there is no MD/CEO to approve yet. */
export const onboardingGovernanceSchema = z.object({
  config: rulesetConfigSchema,
});
export type OnboardingGovernanceInput = z.output<
  typeof onboardingGovernanceSchema
>;

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

const CHOICE_TYPES: readonly string[] = ['SELECT', 'MULTI_SELECT'];

export const createCustomFieldSchema = z
  .object({
    entity: z.enum(CustomFieldEntity).default('INITIATIVE'),
    label: z.string().trim().min(2).max(60),
    type: z.enum(CustomFieldType),
    /** The choices, for SELECT and MULTI_SELECT only. */
    options: z
      .array(text(60))
      .max(50)
      .transform((options) => [...new Set(options)])
      .optional(),
    required: z.boolean().default(false),
  })
  .refine(
    (field) =>
      !CHOICE_TYPES.includes(field.type) || (field.options?.length ?? 0) >= 2,
    { message: 'Give at least two choices', path: ['options'] },
  )
  .refine(
    (field) => CHOICE_TYPES.includes(field.type) || !field.options?.length,
    { message: 'Only choice fields have options', path: ['options'] },
  );
export type CreateCustomFieldInput = z.output<typeof createCustomFieldSchema>;

export const customFieldSchema = z.object({
  id: z.uuid(),
  entity: z.enum(CustomFieldEntity),
  /** Machine name, from the label: "Budget code" → budget_code. */
  key: z.string(),
  label: z.string(),
  type: z.enum(CustomFieldType),
  options: z.array(z.string()).nullable(),
  required: z.boolean(),
  sortOrder: z.int(),
});
export type CustomFieldView = z.infer<typeof customFieldSchema>;

// ---------------------------------------------------------------------------
// The wizard's state
// ---------------------------------------------------------------------------

export const onboardingStateSchema = z.object({
  status: z.enum(OrganisationStatus),
  /** Last step saved (0–5), so "Save and finish later" resumes at the next. */
  step: z.int().min(0).max(5),
  organisation: organisationSettingsSchema,
  /** The plan being set up; null until the framework step is saved. */
  plan: z
    .object({
      id: z.uuid(),
      name: z.string(),
      template: z.enum(FrameworkTemplate),
      startDate: isoDate,
      endDate: isoDate,
      vision: z.string().nullable(),
      mission: z.string().nullable(),
      values: z.array(z.string()),
      aspiration: z.string().nullable(),
      levels: z.array(levelViewSchema),
      /** Elements already in the plan (starter perspectives, for example). */
      elementCount: z.int().min(0),
    })
    .nullable(),
  /** The rules in force (version 1 while setting up). */
  rules: rulesetConfigSchema,
  invitations: z.object({ pending: z.int().min(0) }),
  customFields: z.array(customFieldSchema),
  /** Steps not saved yet; the team step is optional. */
  missing: z.array(z.enum(ONBOARDING_STEPS)),
  canComplete: z.boolean(),
});
export type OnboardingState = z.infer<typeof onboardingStateSchema>;
