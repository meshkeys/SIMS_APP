import { BadRequestException, Injectable } from '@nestjs/common';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
} from '../../infrastructure/database/index.js';
import type {
  OrganisationSettings,
  UpdateOrganisationInput,
} from '@sims/contracts';

const TIME_ZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

const DEFAULT_TERMS = {
  kpi: 'KPI',
  initiative: 'Initiative',
  milestone: 'Milestone',
  task: 'Task',
};

/**
 * The organisation's own settings. Currency and time zone change how
 * figures and deadlines are shown; dates already stored never move.
 * Signed-in people see the change at their next session refresh.
 */
@Injectable()
export class OrganisationService {
  constructor(private readonly db: TenantPrismaService) {}

  async get(): Promise<OrganisationSettings> {
    const org = await this.db.client.organisation.findUniqueOrThrow({
      where: { id: TenantContext.require().organisationId },
    });
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      sector: org.sector,
      country: org.country,
      currency: org.currency,
      timezone: org.timezone,
      fiscalYearStartMonth: org.fiscalYearStartMonth,
      status: org.status,
      terminology: {
        ...DEFAULT_TERMS,
        ...(org.terminology as Partial<typeof DEFAULT_TERMS>),
      },
      createdAt: org.createdAt.toISOString(),
    };
  }

  async update(input: UpdateOrganisationInput): Promise<OrganisationSettings> {
    const errors = [
      input.timezone !== undefined &&
        !TIME_ZONES.has(input.timezone) && {
          path: 'timezone',
          message: 'Choose a time zone such as Africa/Lagos',
          code: 'custom',
        },
      input.currency !== undefined &&
        !CURRENCIES.has(input.currency) && {
          path: 'currency',
          message: 'Choose a currency code such as NGN or USD',
          code: 'custom',
        },
    ].filter(Boolean);
    if (errors.length) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some fields are missing or invalid.',
        errors,
      });
    }
    const before = await this.get();
    await this.db.transaction(async (tx) => {
      await tx.organisation.update({
        where: { id: before.id },
        data: input,
      });
      await recordAudit(tx, {
        action: 'ORGANISATION_UPDATED',
        entityType: 'Organisation',
        entityId: before.id,
        before: Object.fromEntries(
          Object.keys(input).map((k) => [
            k,
            before[k as keyof OrganisationSettings],
          ]),
        ),
        after: input,
      });
    });
    return this.get();
  }
}
