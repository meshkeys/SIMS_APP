import { z } from 'zod';
import {
  emailVerificationResultSchema,
  passwordResetPreviewSchema,
  sessionResponseSchema,
  sessionViewSchema,
} from './auth.js';
import {
  elementRefSchema,
  initiativeRefSchema,
  personRefSchema,
  problemSchema,
} from './common.js';
import {
  cycleStageSchema,
  dashboardSchema,
  elementPerformanceSchema,
  escalationSummarySchema,
  matrixPointSchema,
  milestoneDueSchema,
} from './dashboard.js';
import {
  dependencyViewSchema,
  healthReasonSchema,
  initiativeDetailSchema,
  milestoneViewSchema,
  recalculationSummarySchema,
  registerItemSchema,
  registerPageSchema,
} from './delivery.js';
import {
  changeRequestViewSchema,
  decisionPageSchema,
  decisionViewSchema,
  requestedChangesSchema,
  riskRegisterSchema,
  riskViewSchema,
} from './governance.js';
import {
  invitationPreviewSchema,
  invitationViewSchema,
  sentInvitationSchema,
} from './invitations.js';
import { departmentSchema, memberPageSchema, memberSchema } from './people.js';
import {
  kpiActualRowSchema,
  kpiActualsSheetSchema,
  kpiDetailSchema,
  kpiListItemSchema,
  kpiSummarySchema,
  kpiTargetViewSchema,
} from './kpis.js';
import { documentViewSchema } from './documents.js';
import {
  auditEventSchema,
  auditPageSchema,
  memberAdminPageSchema,
  memberAdminSchema,
  organisationSettingsSchema,
} from './admin.js';
import { customFieldSchema, onboardingStateSchema } from './onboarding.js';
import {
  rulesetImpactSchema,
  rulesetsOverviewSchema,
  rulesetViewSchema,
} from './rulesets-api.js';
import {
  packContentSchema,
  packSectionSchema,
  reportPackSchema,
  reportSnapshotSchema,
} from './reports.js';
import {
  escalationCentreSchema,
  escalationDetailSchema,
  escalationItemSchema,
  ladderLevelSchema,
  portfolioDependencySchema,
  sweepResultSchema,
} from './escalations.js';
import {
  benefitQuarterSchema,
  lowValueItemSchema,
  performanceSchema,
  scorecardRowSchema,
} from './performance.js';
import {
  checklistItemSchema,
  myUpdatesSchema,
  periodSummarySchema,
  updateFormSchema,
  updateListItemSchema,
} from './reporting.js';
import { ROLE_LABELS } from './roles.js';
import { API_ROUTES, type ApiRoute, pathParams } from './routes.js';
import {
  elementContributorSchema,
  elementDetailSchema,
  frameworkTemplateViewSchema,
  healthCountsSchema,
  levelViewSchema,
  mapElementSchema,
  planSummarySchema,
  strategyMapSchema,
} from './strategy.js';

/**
 * Named response shapes: each becomes `#/components/schemas/<id>` and is
 * referenced wherever it appears, so the reference reads like the code.
 */
export const apiComponents = z.registry<{ id: string }>();
const named: [string, z.ZodType][] = [
  ['Problem', problemSchema],
  ['PersonRef', personRefSchema],
  ['ElementRef', elementRefSchema],
  ['InitiativeRef', initiativeRefSchema],
  ['SessionView', sessionViewSchema],
  ['SessionResponse', sessionResponseSchema],
  ['PasswordResetPreview', passwordResetPreviewSchema],
  ['EmailVerificationResult', emailVerificationResultSchema],
  ['InvitationView', invitationViewSchema],
  ['SentInvitation', sentInvitationSchema],
  ['Member', memberSchema],
  ['MemberPage', memberPageSchema],
  ['Department', departmentSchema],
  ['InvitationPreview', invitationPreviewSchema],
  ['FrameworkTemplateView', frameworkTemplateViewSchema],
  ['PlanSummary', planSummarySchema],
  ['LevelView', levelViewSchema],
  ['HealthCounts', healthCountsSchema],
  ['MapElement', mapElementSchema],
  ['StrategyMap', strategyMapSchema],
  ['ElementContributor', elementContributorSchema],
  ['ElementDetail', elementDetailSchema],
  ['KpiTargetView', kpiTargetViewSchema],
  ['KpiSummary', kpiSummarySchema],
  ['KpiListItem', kpiListItemSchema],
  ['KpiDetail', kpiDetailSchema],
  ['KpiActualRow', kpiActualRowSchema],
  ['KpiActualsSheet', kpiActualsSheetSchema],
  ['RegisterItem', registerItemSchema],
  ['RegisterPage', registerPageSchema],
  ['HealthReason', healthReasonSchema],
  ['MilestoneView', milestoneViewSchema],
  ['DependencyView', dependencyViewSchema],
  ['InitiativeDetail', initiativeDetailSchema],
  ['RecalculationSummary', recalculationSummarySchema],
  ['PeriodSummary', periodSummarySchema],
  ['MyUpdates', myUpdatesSchema],
  ['ChecklistItem', checklistItemSchema],
  ['UpdateForm', updateFormSchema],
  ['UpdateListItem', updateListItemSchema],
  ['RiskView', riskViewSchema],
  ['RiskRegister', riskRegisterSchema],
  ['DecisionView', decisionViewSchema],
  ['DecisionPage', decisionPageSchema],
  ['RequestedChanges', requestedChangesSchema],
  ['ChangeRequestView', changeRequestViewSchema],
  ['CycleStage', cycleStageSchema],
  ['ElementPerformance', elementPerformanceSchema],
  ['MatrixPoint', matrixPointSchema],
  ['EscalationSummary', escalationSummarySchema],
  ['MilestoneDue', milestoneDueSchema],
  ['Dashboard', dashboardSchema],
  ['BenefitQuarter', benefitQuarterSchema],
  ['LowValueItem', lowValueItemSchema],
  ['ScorecardRow', scorecardRowSchema],
  ['Performance', performanceSchema],
  ['Document', documentViewSchema],
  ['MemberAdmin', memberAdminSchema],
  ['MemberAdminPage', memberAdminPageSchema],
  ['OrganisationSettings', organisationSettingsSchema],
  ['AuditEvent', auditEventSchema],
  ['AuditPage', auditPageSchema],
  ['OnboardingState', onboardingStateSchema],
  ['CustomField', customFieldSchema],
  ['RulesetView', rulesetViewSchema],
  ['RulesetsOverview', rulesetsOverviewSchema],
  ['RulesetImpact', rulesetImpactSchema],
  ['ReportSnapshot', reportSnapshotSchema],
  ['PackSection', packSectionSchema],
  ['PackContent', packContentSchema],
  ['ReportPack', reportPackSchema],
  ['EscalationItem', escalationItemSchema],
  ['LadderLevel', ladderLevelSchema],
  ['EscalationCentre', escalationCentreSchema],
  ['EscalationDetail', escalationDetailSchema],
  ['SweepResult', sweepResultSchema],
  ['PortfolioDependency', portfolioDependencySchema],
];
for (const [id, schema] of named) apiComponents.add(schema, { id });

type JsonSchema = Record<string, unknown>;

const COMPONENT_URI = (id: string) => `#/components/schemas/${id}`;
const BASE = {
  target: 'draft-2020-12',
  // Transforms (e.g. trimming) have no JSON Schema form; the input/output side is described.
  unrepresentable: 'any',
} as const;

const FORMATS_WITH_PATTERNS = new Set(['uuid', 'date', 'date-time', 'email']);

/**
 * Removes noise zod adds for exactness: the regex behind a standard format
 * (the format already says it) and JavaScript's safe-integer bounds.
 */
function tidy<T>(node: T): T {
  if (Array.isArray(node)) {
    node.forEach(tidy);
  } else if (node && typeof node === 'object') {
    const schema = node as JsonSchema;
    if (FORMATS_WITH_PATTERNS.has(schema.format as string))
      delete schema.pattern;
    if (schema.maximum === Number.MAX_SAFE_INTEGER) delete schema.maximum;
    if (schema.minimum === Number.MIN_SAFE_INTEGER) delete schema.minimum;
    Object.values(schema).forEach(tidy);
  }
  return node;
}

/** A request body or query string, as the client sends it (defaults optional). */
const inputSchema = (schema: z.ZodType): JsonSchema => {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    ...BASE,
    io: 'input',
  }) as JsonSchema;
  return tidy(rest);
};

/** A response: named shapes by reference; lists and nullables around them. */
function responseSchema(schema: z.ZodType, operationId: string): JsonSchema {
  const id = apiComponents.get(schema)?.id;
  if (id) return { $ref: COMPONENT_URI(id) };
  if (schema instanceof z.ZodArray)
    return {
      type: 'array',
      items: responseSchema(schema.element as z.ZodType, operationId),
    };
  if (schema instanceof z.ZodNullable)
    return {
      anyOf: [
        responseSchema(schema.unwrap() as z.ZodType, operationId),
        { type: 'null' },
      ],
    };
  throw new Error(
    `${operationId}: name its response schema in apiComponents (openapi.ts)`,
  );
}

function accessText(route: ApiRoute): string {
  if (route.access === 'public') return 'No sign-in needed.';
  if (route.access === 'member') return 'Any signed-in member.';
  return `Roles: ${route.access.map((role) => ROLE_LABELS[role]).join(', ')}.`;
}

function operation(operationId: string, route: ApiRoute) {
  const parameters: JsonSchema[] = pathParams(route.path).map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  }));
  if (route.query) {
    const query = inputSchema(route.query) as {
      properties?: Record<string, JsonSchema>;
      required?: string[];
    };
    for (const [name, schema] of Object.entries(query.properties ?? {})) {
      parameters.push({
        name,
        in: 'query',
        required: query.required?.includes(name) ?? false,
        schema,
      });
    }
  }
  const success = route.produces
    ? {
        description: 'A file download',
        content: {
          [route.produces]: { schema: { type: 'string', format: 'binary' } },
        },
      }
    : route.response
      ? {
          description: 'Success',
          content: {
            'application/json': {
              schema: responseSchema(route.response, operationId),
            },
          },
        }
      : { description: 'Success (no content)' };

  return {
    operationId,
    tags: [route.tag],
    summary: route.summary,
    description: [route.description, accessText(route)]
      .filter(Boolean)
      .join('\n\n'),
    security: route.access === 'public' ? [] : [{ bearer: [] }],
    ...(parameters.length ? { parameters } : {}),
    ...(route.body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: inputSchema(route.body) },
            },
          },
        }
      : route.uploadField
        ? {
            requestBody: {
              required: true,
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      [route.uploadField]: { type: 'string', format: 'binary' },
                    },
                    required: [route.uploadField],
                  },
                },
              },
            },
          }
        : {}),
    responses: {
      [route.status]: success,
      ...(route.strictRateLimit
        ? { 429: { $ref: '#/components/responses/Problem' } }
        : {}),
      default: { $ref: '#/components/responses/Problem' },
    },
  };
}

/** The OpenAPI 3.1 document for the whole API, generated from the contract. */
export function buildOpenApiDocument(options: {
  version: string;
  /** Where the API is served, e.g. "/api/v1" or "https://api.example.com/api/v1". */
  serverUrl: string;
}) {
  const { schemas } = z.toJSONSchema(apiComponents, {
    ...BASE,
    io: 'output',
    uri: COMPONENT_URI,
  }) as { schemas: Record<string, JsonSchema> };
  for (const schema of Object.values(schemas)) {
    delete schema.$schema;
    delete schema.$id;
    tidy(schema);
  }

  const paths: Record<string, Record<string, unknown>> = {};
  for (const [operationId, route] of Object.entries(API_ROUTES) as [
    string,
    ApiRoute,
  ][]) {
    (paths[route.path] ??= {})[route.method] = operation(operationId, route);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'SIMS API',
      version: options.version,
      description:
        'Strategic Initiative Management & Execution Tracking System. Every request and response here is generated from `@sims/contracts`, the same schemas the server validates with.\n\n' +
        '**Authentication:** sign in with `POST /auth/login`, then send `Authorization: Bearer <accessToken>`. Access tokens last 15 minutes; `POST /auth/refresh` issues a new one from the httpOnly refresh cookie.\n\n' +
        '**Errors** follow RFC 9457 Problem Details with a stable `code` (e.g. `VALIDATION_FAILED`, `PERIOD_NOT_FOUND`).',
    },
    servers: [{ url: options.serverUrl }],
    tags: [...new Set(Object.values(API_ROUTES).map((r) => r.tag))].map(
      (name) => ({ name }),
    ),
    paths,
    components: {
      schemas,
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      responses: {
        Problem: {
          description: 'Error (RFC 9457 Problem Details)',
          content: {
            'application/problem+json': {
              schema: { $ref: COMPONENT_URI('Problem') },
            },
          },
        },
      },
    },
  };
}
