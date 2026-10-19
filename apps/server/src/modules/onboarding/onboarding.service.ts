import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate } from '../../common/data/numbers.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import {
  defaultPlanPeriod,
  missingSteps,
} from '../../domain/onboarding/onboarding-rules.js';
import {
  DEFAULT_RULESET_CONFIG,
  parseRulesetConfig,
} from '../../domain/rulesets/ruleset-config.js';
import { nextElementCode } from '../../domain/strategy/element-codes.js';
import { FRAMEWORK_TEMPLATES } from '../../domain/strategy/framework.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import {
  assertLocale,
  OrganisationService,
} from '../admin/organisation.service.js';
import { PlansService } from '../strategy/plans.service.js';
import { CustomFieldsService } from './custom-fields.service.js';
import {
  describeRulesetChanges,
  type OnboardingFrameworkInput,
  type OnboardingGovernanceInput,
  type OnboardingOrganisationInput,
  type OnboardingState,
  type OnboardingVisionInput,
} from '@sims/contracts';

const finished = () =>
  new ConflictException({
    code: 'ONBOARDING_FINISHED',
    message:
      'Set-up is already finished. Change these in Administration or on the strategy map.',
  });

const incomplete = () =>
  new ConflictException({
    code: 'SETUP_INCOMPLETE',
    message: 'Choose how your strategy is structured first.',
  });

/**
 * The workspace set-up wizard. Each step saves on its own and moves the
 * organisation's step counter forward, so "Save and finish later" resumes
 * where it stopped. Everything is editable again until set-up finishes.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly plans: PlansService,
    private readonly organisation: OrganisationService,
    private readonly customFields: CustomFieldsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async state(): Promise<OnboardingState> {
    const organisation = await this.organisation.get();
    const { step, plan, ruleset, pending } = await this.db.transaction(
      async (tx) => {
        const org = await tx.organisation.findUniqueOrThrow({
          where: { id: organisation.id },
          select: { onboardingStep: true },
        });
        const plan = await this.findPlan(tx);
        const levels = plan
          ? await tx.frameworkLevel.findMany({
              where: { planId: plan.id },
              orderBy: { depth: 'asc' },
              select: {
                id: true,
                depth: true,
                label: true,
                pluralLabel: true,
                codePrefix: true,
                allowsKpis: true,
              },
            })
          : [];
        const elementCount = plan
          ? await tx.strategyElement.count({ where: { planId: plan.id } })
          : 0;
        const ruleset = await tx.ruleset.findFirst({
          where: { status: 'ACTIVE' },
          select: { config: true },
        });
        const pending = await tx.invitation.count({
          where: {
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: this.clock.now() },
          },
        });
        return {
          step: org.onboardingStep,
          plan: plan && { ...plan, levels, elementCount },
          ruleset,
          pending,
        };
      },
    );
    const missing = missingSteps(step, plan !== null);
    return {
      status: organisation.status,
      step,
      organisation,
      plan: plan && {
        id: plan.id,
        name: plan.name,
        template: plan.template,
        startDate: toIsoDate(plan.startDate),
        endDate: toIsoDate(plan.endDate),
        vision: plan.vision,
        mission: plan.mission,
        values: plan.values,
        aspiration: plan.aspiration,
        levels: plan.levels,
        elementCount: plan.elementCount,
      },
      rules: ruleset
        ? parseRulesetConfig(ruleset.config)
        : DEFAULT_RULESET_CONFIG,
      invitations: { pending },
      customFields: await this.customFields.list(),
      missing,
      canComplete: organisation.status === 'ONBOARDING' && plan !== null,
    };
  }

  /** Step 1. */
  async saveOrganisation(
    input: OnboardingOrganisationInput,
  ): Promise<OnboardingState> {
    assertLocale(input);
    await this.db.transaction(async (tx) => {
      const before = await this.assertOnboarding(tx);
      await tx.organisation.update({ where: { id: before.id }, data: input });
      await recordAudit(tx, {
        action: 'ORGANISATION_UPDATED',
        entityType: 'Organisation',
        entityId: before.id,
        before: {
          name: before.name,
          sector: before.sector,
          country: before.country,
          currency: before.currency,
          timezone: before.timezone,
          fiscalYearStartMonth: before.fiscalYearStartMonth,
        },
        after: input,
      });
      await this.advance(tx, before.id, 1);
    });
    return this.state();
  }

  /**
   * Step 2. The first save creates the plan with these levels. Later saves
   * edit the levels in place (the plans API rules apply), or, when another
   * framework is chosen, start the levels again while nothing depends on them.
   */
  async saveFramework(
    input: OnboardingFrameworkInput,
  ): Promise<OnboardingState> {
    const plan = await this.db.transaction(async (tx) => {
      await this.assertOnboarding(tx);
      return this.findPlan(tx);
    });

    if (!plan) {
      await this.db.transaction((tx) => this.createPlan(tx, input));
    } else if (plan.template !== input.template) {
      await this.db.transaction((tx) =>
        this.restartFramework(tx, plan.id, input),
      );
    } else {
      await this.plans.replaceLevels(plan.id, { levels: input.levels });
    }

    await this.db.transaction(async (tx) => {
      const org = await this.assertOnboarding(tx);
      await tx.organisation.update({
        where: { id: org.id },
        data: { terminology: input.terminology },
      });
      await recordAudit(tx, {
        action: 'ORGANISATION_UPDATED',
        entityType: 'Organisation',
        entityId: org.id,
        before: { terminology: org.terminology },
        after: { terminology: input.terminology },
      });
      await this.advance(tx, org.id, 2);
    });
    return this.state();
  }

  /** Step 3. */
  async saveVision(input: OnboardingVisionInput): Promise<OnboardingState> {
    const { org, plan } = await this.db.transaction(async (tx) => ({
      org: await this.assertOnboarding(tx),
      plan: await this.findPlan(tx),
    }));
    if (!plan) throw incomplete();
    await this.plans.update(plan.id, input);
    await this.db.transaction((tx) => this.advance(tx, org.id, 3));
    return this.state();
  }

  /**
   * Step 4. Rewrites the starting ruleset in place: there is no MD/CEO to
   * approve yet and nothing is measured, so maker-checker starts after set-up.
   */
  async saveGovernance(
    input: OnboardingGovernanceInput,
  ): Promise<OnboardingState> {
    await this.db.transaction(async (tx) => {
      const org = await this.assertOnboarding(tx);
      const active = await tx.ruleset.findFirst({
        where: { status: 'ACTIVE' },
      });
      const before = active
        ? parseRulesetConfig(active.config)
        : DEFAULT_RULESET_CONFIG;
      const summary = 'Rules set during workspace set-up';
      let rulesetId: string;
      if (active) {
        rulesetId = active.id;
        await tx.ruleset.update({
          where: { id: active.id },
          data: { config: input.config, changeSummary: summary },
        });
      } else {
        const membershipId = TenantContext.require().membershipId ?? null;
        rulesetId = uuidv7();
        await tx.ruleset.create({
          data: {
            id: rulesetId,
            organisationId: org.id,
            version: 1,
            status: 'ACTIVE',
            config: input.config,
            changeSummary: summary,
            proposedById: membershipId,
            approvedById: membershipId,
            effectiveFrom: this.clock.now(),
          },
        });
      }
      await recordAudit(tx, {
        action: 'RULESET_SET_UP',
        entityType: 'Ruleset',
        entityId: rulesetId,
        after: { changes: describeRulesetChanges(before, input.config) },
      });
      await this.advance(tx, org.id, 4);
    });
    return this.state();
  }

  /** Finish: the workspace becomes active. Inviting the team is optional. */
  async complete(): Promise<OnboardingState> {
    await this.db.transaction(async (tx) => {
      const org = await this.assertOnboarding(tx);
      if (!(await this.findPlan(tx))) throw incomplete();
      await tx.organisation.update({
        where: { id: org.id },
        data: { status: 'ACTIVE', onboardingStep: 5 },
      });
      await recordAudit(tx, {
        action: 'ONBOARDING_COMPLETED',
        entityType: 'Organisation',
        entityId: org.id,
        before: { status: org.status, onboardingStep: org.onboardingStep },
        after: { status: 'ACTIVE', onboardingStep: 5 },
      });
    });
    return this.state();
  }

  // ---------------------------------------------------------------------------

  private async assertOnboarding(tx: TenantTransactionClient) {
    const org = await tx.organisation.findUniqueOrThrow({
      where: { id: TenantContext.require().organisationId },
    });
    if (org.status !== 'ONBOARDING') throw finished();
    return org;
  }

  /** The step counter only moves forward. */
  private async advance(
    tx: TenantTransactionClient,
    organisationId: string,
    step: number,
  ) {
    await tx.organisation.updateMany({
      where: { id: organisationId, onboardingStep: { lt: step } },
      data: { onboardingStep: step },
    });
  }

  /** The plan being set up: the newest one that is not archived. */
  private findPlan(tx: TenantTransactionClient) {
    return tx.strategicPlan.findFirst({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async createPlan(
    tx: TenantTransactionClient,
    input: OnboardingFrameworkInput,
  ) {
    const org = await this.assertOnboarding(tx);
    const period = defaultPlanPeriod(
      org.fiscalYearStartMonth,
      this.clock.now(),
    );
    const planId = uuidv7();
    await tx.strategicPlan.create({
      data: {
        id: planId,
        organisationId: org.id,
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        template: input.template,
        status: 'DRAFT',
        values: [],
      },
    });
    await this.createLevels(tx, planId, input);
    await recordAudit(tx, {
      action: 'PLAN_CREATED',
      entityType: 'StrategicPlan',
      entityId: planId,
      after: { name: period.name, template: input.template },
    });
  }

  private async restartFramework(
    tx: TenantTransactionClient,
    planId: string,
    input: OnboardingFrameworkInput,
  ) {
    const kpis = await tx.kpi.count({ where: { element: { planId } } });
    const initiatives = await tx.initiative.count({ where: { planId } });
    if (kpis + initiatives > 0) {
      throw new ConflictException({
        code: 'FRAMEWORK_IN_USE',
        message:
          'KPIs or initiatives already use this framework. Rename its levels instead of choosing another.',
      });
    }
    const before = await tx.frameworkLevel.findMany({
      where: { planId },
      orderBy: { depth: 'asc' },
      select: { depth: true, label: true },
    });
    await tx.strategyElement.deleteMany({ where: { planId } });
    await tx.frameworkLevel.deleteMany({ where: { planId } });
    await tx.strategicPlan.update({
      where: { id: planId },
      data: { template: input.template },
    });
    await this.createLevels(tx, planId, input);
    await recordAudit(tx, {
      action: 'LEVELS_CHANGED',
      entityType: 'StrategicPlan',
      entityId: planId,
      before: { levels: before },
      after: {
        template: input.template,
        levels: input.levels.map((level, index) => ({
          depth: index + 1,
          label: level.label,
        })),
      },
    });
  }

  /** The chosen levels, plus the template's starter elements on the top level. */
  private async createLevels(
    tx: TenantTransactionClient,
    planId: string,
    input: OnboardingFrameworkInput,
  ) {
    const { organisationId } = TenantContext.require();
    const levelIds = input.levels.map(() => uuidv7());
    await tx.frameworkLevel.createMany({
      data: input.levels.map((level, index) => ({
        id: levelIds[index],
        organisationId,
        planId,
        depth: index + 1,
        label: level.label,
        pluralLabel: level.pluralLabel,
        codePrefix: level.codePrefix,
        allowsKpis: level.allowsKpis,
      })),
    });
    const codes: string[] = [];
    const starters = FRAMEWORK_TEMPLATES[input.template].starterElements;
    for (const [index, title] of starters.entries()) {
      const code = nextElementCode({
        prefix: input.levels[0].codePrefix,
        siblingCodes: codes,
      });
      codes.push(code);
      await tx.strategyElement.create({
        data: {
          id: uuidv7(),
          organisationId,
          planId,
          levelId: levelIds[0],
          code,
          title,
          sortOrder: index,
        },
      });
    }
  }
}
