import { z } from 'zod';
import { isoDate, isoDateTime, personRefSchema } from './common.js';
import { Health, Role, Trajectory } from './enums.js';

// ---------------------------------------------------------------------------
// Catalogue: templates, sections and audiences
// ---------------------------------------------------------------------------

export const REPORT_SECTIONS = {
  executive_summary: 'Executive summary & headline numbers',
  pillar_performance: 'Pillar performance: execution vs impact',
  delivery_vs_value: 'Delivery vs value matrix',
  exceptions: 'Delayed & at-risk initiatives',
  decisions: 'Decisions required',
  benefits: 'Benefits realisation',
  register: 'Full initiative register (appendix)',
  pillar_overview: 'Pillar overview and objectives',
  pillar_kpis: 'Pillar KPIs',
  pillar_initiatives: 'Pillar initiatives',
} as const;
export type ReportSectionKey = keyof typeof REPORT_SECTIONS;
const sectionKeys = Object.keys(REPORT_SECTIONS) as [
  ReportSectionKey,
  ...ReportSectionKey[],
];

export const REPORT_TEMPLATE_KEYS = [
  'MONTHLY_MANAGEMENT',
  'QUARTERLY_BOARD',
  'PILLAR_DEEP_DIVE',
] as const;
export type ReportTemplateKey = (typeof REPORT_TEMPLATE_KEYS)[number];

export const REPORT_AUDIENCES = {
  BOARD: 'Board of Directors',
  EXCO: 'Executive committee (EXCO)',
} as const;
export type ReportAudience = keyof typeof REPORT_AUDIENCES;

export const REPORT_FORMATS = ['PDF', 'PPTX', 'XLSX'] as const;
export type ReportFormatKey = (typeof REPORT_FORMATS)[number];

/** The templates offered in the board pack builder. */
export const REPORT_TEMPLATES: Record<
  ReportTemplateKey,
  {
    name: string;
    description: string;
    defaultAudience: ReportAudience;
    /** Sections offered, in order; `checked` ones are on by default. */
    sections: { key: ReportSectionKey; checked: boolean }[];
    /** Needs one pillar to report on. */
    needsPillar: boolean;
  }
> = {
  MONTHLY_MANAGEMENT: {
    name: 'Monthly management report',
    description: 'Full portfolio, exceptions and owner commentary for EXCO',
    defaultAudience: 'EXCO',
    needsPillar: false,
    sections: [
      { key: 'executive_summary', checked: true },
      { key: 'pillar_performance', checked: true },
      { key: 'delivery_vs_value', checked: true },
      { key: 'exceptions', checked: true },
      { key: 'decisions', checked: true },
      { key: 'benefits', checked: true },
      { key: 'register', checked: true },
    ],
  },
  QUARTERLY_BOARD: {
    name: 'Quarterly Board pack',
    description: 'Pillar health, delivery vs value, decisions for the Board',
    defaultAudience: 'BOARD',
    needsPillar: false,
    sections: [
      { key: 'executive_summary', checked: true },
      { key: 'pillar_performance', checked: true },
      { key: 'delivery_vs_value', checked: true },
      { key: 'exceptions', checked: true },
      { key: 'decisions', checked: true },
      { key: 'benefits', checked: true },
      { key: 'register', checked: false },
    ],
  },
  PILLAR_DEEP_DIVE: {
    name: 'Pillar deep dive',
    description: 'One pillar, every objective, KPI and initiative',
    defaultAudience: 'EXCO',
    needsPillar: true,
    sections: [
      { key: 'pillar_overview', checked: true },
      { key: 'pillar_kpis', checked: true },
      { key: 'pillar_initiatives', checked: true },
      { key: 'decisions', checked: false },
    ],
  },
};

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const packDefinitionSchema = z
  .object({
    snapshotId: z.uuid(),
    template: z.enum(REPORT_TEMPLATE_KEYS),
    audience: z.enum(['BOARD', 'EXCO']),
    sections: z
      .array(z.enum(sectionKeys))
      .min(1, 'Choose at least one section')
      .max(20),
    /** The pillar, for a pillar deep dive. */
    scopeElementId: z.uuid().nullable().default(null),
    narrative: z.string().trim().max(4000).nullable().default(null),
  })
  .superRefine((pack, ctx) => {
    const offered = new Set(
      REPORT_TEMPLATES[pack.template].sections.map((s) => s.key),
    );
    pack.sections.forEach((key, index) => {
      if (!offered.has(key))
        ctx.addIssue({
          code: 'custom',
          path: ['sections', index],
          message: `${REPORT_SECTIONS[key]} is not part of this template`,
        });
    });
    if (new Set(pack.sections).size !== pack.sections.length)
      ctx.addIssue({
        code: 'custom',
        path: ['sections'],
        message: 'Each section can appear once',
      });
    if (REPORT_TEMPLATES[pack.template].needsPillar && !pack.scopeElementId)
      ctx.addIssue({
        code: 'custom',
        path: ['scopeElementId'],
        message: 'Choose the pillar to report on',
      });
  });
export type PackDefinition = z.output<typeof packDefinitionSchema>;

export const createPackSchema = z.intersection(
  packDefinitionSchema,
  z.object({
    /** Defaults to a name from the template and period, e.g. "Q3 2026 Board pack". */
    title: z.string().trim().min(3).max(200).optional(),
    formats: z
      .array(z.enum(REPORT_FORMATS))
      .min(1, 'Choose at least one format')
      .max(3),
  }),
);
export type CreatePackInput = z.output<typeof createPackSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const reportSnapshotSchema = z.object({
  id: z.uuid(),
  periodId: z.uuid(),
  /** "September 2026" */
  period: z.string(),
  periodEnd: isoDate,
  /** "Q3 2026" for a quarter's last month, else null. */
  quarter: z.string().nullable(),
  lockedAt: isoDateTime,
  /** False for snapshots taken before packs could be built from them. */
  usable: z.boolean(),
  /** Pillars, for choosing a deep dive. */
  pillars: z.array(
    z.object({ id: z.uuid(), code: z.string(), title: z.string() }),
  ),
});
export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;

const initiativeRow = z.object({
  code: z.string(),
  title: z.string(),
  pillar: z.string().nullable(),
  owner: z.string().nullable(),
  health: z.enum(Health),
  verifiedProgress: z.number(),
  plannedProgress: z.number(),
  /** Verified minus planned, percentage points. */
  gapPp: z.number(),
  impactScore: z.number().nullable(),
  impactSummary: z.string().nullable(),
});
export type PackInitiativeRow = z.infer<typeof initiativeRow>;

const pillarRow = z.object({
  code: z.string(),
  title: z.string(),
  health: z.enum(Health),
  executionScore: z.number().nullable(),
  impactScore: z.number().nullable(),
  initiatives: z.int().min(0),
  atRisk: z.int().min(0),
  delayed: z.int().min(0),
});

const decisionRow = z.object({
  reference: z.string(),
  title: z.string(),
  requiredFrom: z.enum(Role),
  initiative: z.string().nullable(),
  dueDate: isoDate.nullable(),
});

const kpiRow = z.object({
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  objective: z.string(),
  baseline: z.number().nullable(),
  target: z.number().nullable(),
  latestValue: z.number().nullable(),
  trajectory: z.enum(Trajectory),
});

/** One page group of a pack, by section. */
export const packSectionSchema = z.discriminatedUnion('key', [
  z.object({
    key: z.literal('executive_summary'),
    title: z.string(),
    pages: z.int().min(1),
    narrative: z.string().nullable(),
    headline: z.object({
      initiatives: z.int(),
      onTrack: z.int(),
      atRisk: z.int(),
      delayed: z.int(),
      unknown: z.int(),
      kpisOnTrajectory: z.int(),
      kpisTotal: z.int(),
      benefitsRealised: z.number(),
      benefitsRealisedPct: z.number().nullable(),
      openEscalations: z.int(),
      decisionsPending: z.int(),
    }),
  }),
  z.object({
    key: z.literal('pillar_performance'),
    title: z.string(),
    pages: z.int().min(1),
    pillars: z.array(pillarRow),
  }),
  z.object({
    key: z.literal('delivery_vs_value'),
    title: z.string(),
    pages: z.int().min(1),
    thresholdPct: z.number(),
    quadrants: z.object({
      ON_PLAN_VALUE_OK: z.array(z.string()),
      ON_PLAN_VALUE_LOW: z.array(z.string()),
      BEHIND_VALUE_OK: z.array(z.string()),
      BEHIND_VALUE_LOW: z.array(z.string()),
      NOT_MEASURABLE: z.array(z.string()),
    }),
  }),
  z.object({
    key: z.literal('exceptions'),
    title: z.string(),
    pages: z.int().min(1),
    initiatives: z.array(initiativeRow),
  }),
  z.object({
    key: z.literal('decisions'),
    title: z.string(),
    pages: z.int().min(1),
    decisions: z.array(decisionRow),
  }),
  z.object({
    key: z.literal('benefits'),
    title: z.string(),
    pages: z.int().min(1),
    currency: z.string(),
    year: z.int(),
    expected: z.number(),
    expectedToDate: z.number(),
    realisedToDate: z.number(),
    realisedPctOfExpected: z.number().nullable(),
    quarters: z.array(
      z.object({
        label: z.string(),
        expected: z.number(),
        realised: z.number().nullable(),
        forecast: z.number().nullable(),
      }),
    ),
  }),
  z.object({
    key: z.literal('register'),
    title: z.string(),
    pages: z.int().min(1),
    initiatives: z.array(initiativeRow),
  }),
  z.object({
    key: z.literal('pillar_overview'),
    title: z.string(),
    pages: z.int().min(1),
    pillar: pillarRow,
    objectives: z.array(
      z.object({
        code: z.string(),
        title: z.string(),
        health: z.enum(Health),
        executionScore: z.number().nullable(),
        impactScore: z.number().nullable(),
      }),
    ),
  }),
  z.object({
    key: z.literal('pillar_kpis'),
    title: z.string(),
    pages: z.int().min(1),
    kpis: z.array(kpiRow),
  }),
  z.object({
    key: z.literal('pillar_initiatives'),
    title: z.string(),
    pages: z.int().min(1),
    initiatives: z.array(initiativeRow),
  }),
]);
export type PackSection = z.infer<typeof packSectionSchema>;

/** Everything a pack shows: the preview draws it, the renderers print it. */
export const packContentSchema = z.object({
  title: z.string(),
  template: z.enum(REPORT_TEMPLATE_KEYS),
  audience: z.enum(['BOARD', 'EXCO']),
  period: z.string(),
  lockedAt: isoDateTime,
  organisation: z.string(),
  /** Cover page plus every section's pages. */
  pageCount: z.int().min(1),
  /** Sensitive initiatives left out of lists for this audience (still in totals). */
  sensitiveSummarised: z.int().min(0),
  sections: z.array(packSectionSchema),
});
export type PackContent = z.infer<typeof packContentSchema>;

export const reportPackSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  template: z.enum(REPORT_TEMPLATE_KEYS),
  audience: z.string(),
  period: z.string(),
  snapshotId: z.uuid().nullable(),
  sections: z.array(z.string()),
  formats: z.array(z.enum(REPORT_FORMATS)),
  narrative: z.string().nullable(),
  status: z.enum(['QUEUED', 'GENERATING', 'READY', 'FAILED']),
  version: z.string(),
  /** Formats whose file is ready to download. */
  available: z.array(z.enum(REPORT_FORMATS)),
  requestedBy: personRefSchema.nullable(),
  requestedAt: isoDateTime,
  issuedAt: isoDateTime.nullable(),
  error: z.string().nullable(),
});
export type ReportPack = z.infer<typeof reportPackSchema>;
