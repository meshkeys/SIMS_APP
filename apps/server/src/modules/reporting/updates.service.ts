import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { canSeeInitiative } from '../../domain/access/initiative-visibility.js';
import { relationTo } from '../../domain/delivery/permissions.js';
import {
  plannedCompletion,
  verifiedCompletion,
} from '../../domain/delivery/progress.js';
import { canPerform, owesUpdate } from '../../domain/reporting/obligations.js';
import {
  type ChecklistItem,
  evaluateUpdate,
  type UpdateLineFacts,
} from '../../domain/reporting/update-checklist.js';
import type {
  CommentKind,
  Health,
  Severity,
  UpdateStatus,
} from '../../generated/prisma/enums.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { HealthRecalculationService } from '../delivery/health-recalculation.service.js';
import { DecisionsService } from '../governance/decisions.service.js';
import { seesAllInitiatives } from '../delivery/visibility.js';
import { personSelect, type PersonRef, toPersonRef } from '../people/person.js';
import { PlansService } from '../strategy/plans.service.js';
import { periodNotFound } from './periods.service.js';
import type {
  ApproveInput,
  ChallengeInput,
  CommentInput,
  UpdateDraftInput,
  UpdatesQuery,
  VerifyInput,
} from './reporting.schemas.js';

export type MyUpdateStatus = UpdateStatus | 'NOT_STARTED';

export interface MyUpdates {
  period: {
    id: string;
    name: string;
    status: string;
    submissionDueAt: string | null;
  } | null;
  items: {
    initiativeId: string;
    code: string;
    title: string;
    status: MyUpdateStatus;
    /** Needs the owner's attention now (not started, draft, or challenged). */
    actionNeeded: boolean;
    dueAt: string | null;
    overdue: boolean;
    savedAt: string | null;
    submittedAt: string | null;
  }[];
}

export interface UpdateForm {
  period: {
    id: string;
    name: string;
    status: string;
    submissionDueAt: string | null;
    locked: boolean;
  };
  initiative: {
    id: string;
    code: string;
    title: string;
    owner: PersonRef | null;
    sponsor: PersonRef | null;
  };
  update: {
    id: string;
    status: UpdateStatus;
    submittedBy: PersonRef | null;
    savedAt: string;
    submittedAt: string | null;
    reviewedAt: string | null;
    approvedAt: string | null;
    claimedProgress: number;
    verifiedProgress: number | null;
    progressNarrative: string | null;
    varianceExplanation: string | null;
    recoveryAction: string | null;
    nextSteps: string | null;
    needsDecision: boolean;
  } | null;
  lines: {
    milestoneId: string;
    title: string;
    weight: number;
    isCritical: boolean;
    baselineDate: string;
    forecastDate: string | null;
    lastVerified: number;
    claimed: number | null;
    verified: number | null;
    /** Completed milestones are locked at 100%. */
    locked: boolean;
    evidenceRequired: boolean;
    evidenceCount: number;
    needsEvidence: boolean;
    note: string | null;
  }[];
  evaluation: {
    claimedCompletion: number;
    plannedCompletion: number;
    variancePp: number;
    /** The status the claimed figures would give, from the rules engine. */
    healthPreview: Health | null;
    checklist: ChecklistItem[];
    canSubmit: boolean;
  };
  risks: { id: string; type: string; title: string; severity: Severity }[];
  comments: {
    id: string;
    parentId: string | null;
    kind: CommentKind;
    body: string;
    author: PersonRef | null;
    at: string;
  }[];
  /** What the caller may do now, so the screen shows the right buttons. */
  can: {
    edit: boolean;
    submit: boolean;
    verify: boolean;
    challenge: boolean;
    approve: boolean;
    comment: boolean;
  };
}

export interface UpdateListItem {
  updateId: string;
  initiativeId: string;
  code: string;
  title: string;
  owner: PersonRef | null;
  status: UpdateStatus;
  claimedProgress: number;
  verifiedProgress: number | null;
  plannedProgress: number | null;
  submittedAt: string | null;
  evidenceFlags: number;
}

const STATUS_PRIORITY: Record<MyUpdateStatus, number> = {
  CHALLENGED: 0,
  NOT_STARTED: 1,
  DRAFT: 2,
  SUBMITTED: 3,
  REVIEWED: 4,
  APPROVED: 5,
};

const updateNotFound = () =>
  new NotFoundException({
    code: 'UPDATE_NOT_FOUND',
    message: 'No update has been started for this period.',
  });

const wrongStatus = (status: UpdateStatus, action: string) =>
  new ConflictException({
    code: 'INVALID_UPDATE_STATUS',
    message: `A ${status.toLowerCase()} update cannot be ${action}.`,
  });

const invalid = (errors: { path: string; message: string }[]) =>
  new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Some fields are missing or invalid.',
    errors: errors.map((e) => ({ ...e, code: 'custom' })),
  });

@Injectable()
export class UpdatesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly plans: PlansService,
    private readonly recalculation: HealthRecalculationService,
    private readonly decisions: DecisionsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** "My updates": what the caller owes in the current period, most urgent first. */
  async mine(caller: AuthContext): Promise<MyUpdates> {
    const planId = await this.plans.currentPlanId();
    const db = this.db.client;
    const period = await db.reportingPeriod.findFirst({
      where: { planId, status: { not: 'LOCKED' } },
      orderBy: { startDate: 'desc' },
    });
    if (!period) return { period: null, items: [] };

    const initiatives = await db.initiative.findMany({
      where: {
        planId,
        ownerId: caller.membershipId,
        status: { in: ['ACTIVE', 'ON_HOLD'] },
      },
      select: {
        id: true,
        code: true,
        title: true,
        activatedAt: true,
        baselineStart: true,
        updates: {
          where: { periodId: period.id },
          select: { status: true, updatedAt: true, submittedAt: true },
        },
      },
    });
    const now = this.clock.now();
    const items = initiatives
      .filter((i) => owesUpdate(i, period))
      .map((i) => {
        const update = i.updates[0];
        const status: MyUpdateStatus = update?.status ?? 'NOT_STARTED';
        const actionNeeded = ['NOT_STARTED', 'DRAFT', 'CHALLENGED'].includes(
          status,
        );
        return {
          initiativeId: i.id,
          code: i.code,
          title: i.title,
          status,
          actionNeeded,
          dueAt: period.submissionDueAt?.toISOString() ?? null,
          overdue:
            actionNeeded &&
            status !== 'CHALLENGED' &&
            !!period.submissionDueAt &&
            period.submissionDueAt < now,
          savedAt: update?.updatedAt.toISOString() ?? null,
          submittedAt: update?.submittedAt?.toISOString() ?? null,
        };
      })
      .sort(
        (a, b) =>
          STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
          a.code.localeCompare(b.code),
      );
    return {
      period: {
        id: period.id,
        name: period.name,
        status: period.status,
        submissionDueAt: period.submissionDueAt?.toISOString() ?? null,
      },
      items,
    };
  }

  /** The Strategy Office's review queue (sponsors see their own initiatives). */
  async list(
    caller: AuthContext,
    periodId: string,
    query: UpdatesQuery,
  ): Promise<UpdateListItem[]> {
    const period = await this.db.client.reportingPeriod.findUnique({
      where: { id: periodId },
      select: { id: true },
    });
    if (!period) throw periodNotFound();
    const scope = seesAllInitiatives(caller)
      ? {}
      : {
          OR: [
            { ownerId: caller.membershipId },
            { sponsorId: caller.membershipId },
          ],
        };
    const updates = await this.db.client.statusUpdate.findMany({
      where: {
        periodId,
        ...(query.status ? { status: query.status } : {}),
        initiative: scope,
      },
      orderBy: [{ submittedAt: 'asc' }],
      include: {
        initiative: {
          select: { id: true, code: true, title: true, owner: personSelect },
        },
        lines: {
          select: {
            claimedCompletion: true,
            previousVerified: true,
            milestone: { select: { evidenceRequired: true } },
          },
        },
      },
    });
    return updates.map((u) => ({
      updateId: u.id,
      initiativeId: u.initiative.id,
      code: u.initiative.code,
      title: u.initiative.title,
      owner: toPersonRef(u.initiative.owner),
      status: u.status,
      claimedProgress: toNumber(u.claimedProgress),
      verifiedProgress: toNumber(u.verifiedProgress),
      plannedProgress: toNumber(u.plannedProgress),
      submittedAt: u.submittedAt?.toISOString() ?? null,
      evidenceFlags: u.lines.filter(
        (l) =>
          l.milestone.evidenceRequired &&
          toNumber(l.claimedCompletion) > toNumber(l.previousVerified),
      ).length,
    }));
  }

  async form(
    caller: AuthContext,
    periodId: string,
    initiativeId: string,
  ): Promise<UpdateForm> {
    return this.db.transaction((tx) =>
      this.buildForm(tx, caller, periodId, initiativeId),
    );
  }

  /** Save without submitting (creates the draft on first save). */
  async saveDraft(
    caller: AuthContext,
    periodId: string,
    initiativeId: string,
    input: UpdateDraftInput,
  ): Promise<UpdateForm> {
    return this.db.transaction(async (tx) => {
      await this.writeDraft(tx, caller, periodId, initiativeId, input);
      return this.buildForm(tx, caller, periodId, initiativeId);
    });
  }

  /**
   * Submit for review (optionally with last-minute changes). Refused until the
   * checklist's blocking items are satisfied. Applies the claims and forecasts
   * to the milestones and clears the overdue flag.
   */
  async submit(
    caller: AuthContext,
    periodId: string,
    initiativeId: string,
    input: UpdateDraftInput,
  ): Promise<UpdateForm> {
    return this.db.transaction(async (tx) => {
      await this.writeDraft(tx, caller, periodId, initiativeId, input);
      const form = await this.buildForm(tx, caller, periodId, initiativeId);
      const update = form.update!;
      if (!canPerform('SUBMIT', update.status))
        throw wrongStatus(update.status, 'submitted');
      if (!form.evaluation.canSubmit) {
        throw new ConflictException({
          code: 'UPDATE_INCOMPLETE',
          message: 'Complete the checklist before submitting.',
          errors: form.evaluation.checklist
            .filter((item) => item.blocking && !item.ok)
            .map((item) => ({
              path: item.key,
              message: item.message,
              code: 'incomplete',
            })),
        });
      }

      const now = this.clock.now();
      const resubmission = update.status === 'CHALLENGED';
      await tx.statusUpdate.update({
        where: { id: update.id },
        data: {
          status: 'SUBMITTED',
          submittedAt: now,
          claimedProgress: form.evaluation.claimedCompletion,
          plannedProgress: form.evaluation.plannedCompletion,
          healthAtSubmission: form.evaluation.healthPreview ?? 'UNKNOWN',
        },
      });
      for (const line of form.lines) {
        if (line.claimed === null || line.locked) continue;
        await tx.milestone.update({
          where: { id: line.milestoneId },
          data: {
            claimedCompletion: line.claimed,
            ...(line.forecastDate
              ? { forecastDate: new Date(`${line.forecastDate}T00:00:00Z`) }
              : {}),
          },
        });
      }
      await tx.initiative.update({
        where: { id: initiativeId },
        data: { lastUpdateAt: now },
      });
      await recordAudit(tx, {
        action: resubmission ? 'UPDATE_RESUBMITTED' : 'UPDATE_SUBMITTED',
        entityType: 'Initiative',
        entityId: initiativeId,
        after: {
          period: form.period.name,
          claimedProgress: form.evaluation.claimedCompletion,
          plannedProgress: form.evaluation.plannedCompletion,
        },
      });
      // "I need a management decision" → in front of the sponsor.
      if (update.needsDecision) {
        const period = await tx.reportingPeriod.findUniqueOrThrow({
          where: { id: periodId },
          select: { sponsorReviewDueAt: true },
        });
        await this.decisions.requestFromUpdate(tx, {
          initiativeId,
          code: form.initiative.code,
          title: form.initiative.title,
          sponsorId: form.initiative.sponsor?.membershipId ?? null,
          context: update.varianceExplanation ?? update.progressNarrative,
          dueDate: period.sponsorReviewDueAt,
        });
      }
      await this.recalculation.recalculateIn(tx, [initiativeId]);
      return this.buildForm(tx, caller, periodId, initiativeId);
    });
  }

  /**
   * Strategy Office verification: the verified figure per milestone (never
   * above the claim) becomes the milestone's verified completion, which is
   * what progress and health are measured on.
   */
  async verify(
    caller: AuthContext,
    periodId: string,
    initiativeId: string,
    input: VerifyInput,
  ): Promise<UpdateForm> {
    return this.db.transaction(async (tx) => {
      const { update, relation } = await this.context(
        tx,
        caller,
        periodId,
        initiativeId,
      );
      if (relation !== 'OFFICE') throw officeOnly('verify updates');
      if (!canPerform('VERIFY', update.status))
        throw wrongStatus(update.status, 'verified');

      const lines = await tx.statusUpdateLine.findMany({
        where: { updateId: update.id },
        include: { milestone: { select: { title: true, weight: true } } },
      });
      const given = new Map(
        input.lines.map((l) => [l.milestoneId, l.verifiedCompletion]),
      );
      const errors = lines.flatMap((line, index) => {
        const verified = given.get(line.milestoneId);
        if (verified === undefined)
          return [
            {
              path: `lines.${index}`,
              message: `Verify ${line.milestone.title}`,
            },
          ];
        if (verified > toNumber(line.claimedCompletion)) {
          return [
            {
              path: `lines.${index}.verifiedCompletion`,
              message: `Cannot exceed the ${toNumber(line.claimedCompletion)}% claimed for ${line.milestone.title}`,
            },
          ];
        }
        return [];
      });
      const unknown = input.lines.filter(
        (l) => !lines.some((line) => line.milestoneId === l.milestoneId),
      );
      if (unknown.length)
        errors.push({
          path: 'lines',
          message: 'Some milestones are not part of this update',
        });
      if (errors.length) throw invalid(errors);

      const now = this.clock.now();
      for (const line of lines) {
        const verified = given.get(line.milestoneId)!;
        await tx.statusUpdateLine.update({
          where: { id: line.id },
          data: { verifiedCompletion: verified },
        });
        await tx.milestone.update({
          where: { id: line.milestoneId },
          data: {
            verifiedCompletion: verified,
            status:
              verified >= 100
                ? 'COMPLETE'
                : verified > 0
                  ? 'IN_PROGRESS'
                  : 'NOT_STARTED',
            ...(verified >= 100
              ? { actualDate: new Date(`${toIsoDate(now)}T00:00:00Z`) }
              : {}),
          },
        });
      }
      const verifiedProgress = verifiedCompletion(
        (
          await tx.milestone.findMany({
            where: { initiativeId },
            select: { weight: true, verifiedCompletion: true },
          })
        ).map((m) => ({
          weight: toNumber(m.weight),
          verifiedCompletion: toNumber(m.verifiedCompletion),
          baselineStartDate: null,
          baselineDate: now,
        })),
      );
      await tx.statusUpdate.update({
        where: { id: update.id },
        data: { status: 'REVIEWED', verifiedProgress, reviewedAt: now },
      });
      if (input.comment)
        await this.addComment(tx, caller, update.id, input.comment, 'COMMENT');
      await recordAudit(tx, {
        action: 'UPDATE_VERIFIED',
        entityType: 'Initiative',
        entityId: initiativeId,
        after: {
          claimedProgress: toNumber(update.claimedProgress),
          verifiedProgress,
        },
      });
      await this.recalculation.recalculateIn(tx, [initiativeId]);
      return this.buildForm(tx, caller, periodId, initiativeId);
    });
  }

  /** Send back to the owner with a reason (Strategy Office; or the sponsor once verified). */
  async challenge(
    caller: AuthContext,
    periodId: string,
    initiativeId: string,
    input: ChallengeInput,
  ): Promise<UpdateForm> {
    return this.db.transaction(async (tx) => {
      const { update, relation } = await this.context(
        tx,
        caller,
        periodId,
        initiativeId,
      );
      const allowed =
        (relation === 'OFFICE' && canPerform('CHALLENGE', update.status)) ||
        (relation === 'SPONSOR' && update.status === 'REVIEWED');
      if (!allowed) {
        if (relation === 'OFFICE' || relation === 'SPONSOR')
          throw wrongStatus(update.status, 'challenged');
        throw officeOnly('challenge updates');
      }
      await tx.statusUpdate.update({
        where: { id: update.id },
        data: { status: 'CHALLENGED' },
      });
      await this.addComment(tx, caller, update.id, input.comment, 'CHALLENGE');
      await recordAudit(tx, {
        action: 'UPDATE_CHALLENGED',
        entityType: 'Initiative',
        entityId: initiativeId,
        after: { comment: input.comment },
      });
      return this.buildForm(tx, caller, periodId, initiativeId);
    });
  }

  /** The sponsor confirms the verified status (the Strategy Office may confirm on their behalf). */
  async approve(
    caller: AuthContext,
    periodId: string,
    initiativeId: string,
    input: ApproveInput,
  ): Promise<UpdateForm> {
    return this.db.transaction(async (tx) => {
      const { update, relation } = await this.context(
        tx,
        caller,
        periodId,
        initiativeId,
      );
      if (relation !== 'SPONSOR' && relation !== 'OFFICE') {
        throw new ForbiddenException({
          code: 'SPONSOR_ONLY',
          message:
            'Only the initiative’s sponsor (or the Strategy Office) can confirm an update.',
        });
      }
      if (!canPerform('APPROVE', update.status))
        throw wrongStatus(update.status, 'approved');
      const now = this.clock.now();
      await tx.statusUpdate.update({
        where: { id: update.id },
        data: { status: 'APPROVED', approvedAt: now },
      });
      await tx.initiative.update({
        where: { id: initiativeId },
        data: { lastVerifiedUpdateAt: now },
      });
      if (input.comment)
        await this.addComment(tx, caller, update.id, input.comment, 'COMMENT');
      await recordAudit(tx, {
        action: 'UPDATE_APPROVED',
        entityType: 'Initiative',
        entityId: initiativeId,
        after: { onBehalfOfSponsor: relation === 'OFFICE' },
      });
      return this.buildForm(tx, caller, periodId, initiativeId);
    });
  }

  /** A note on the update. An owner writing while challenged is responding to the challenge. */
  async comment(
    caller: AuthContext,
    periodId: string,
    initiativeId: string,
    input: CommentInput,
  ): Promise<UpdateForm> {
    return this.db.transaction(async (tx) => {
      const { update, relation } = await this.context(
        tx,
        caller,
        periodId,
        initiativeId,
      );
      if (relation === 'NONE') throw officeOnly('comment on this update');
      if (input.parentId) {
        const parent = await tx.comment.findUnique({
          where: { id: input.parentId },
          select: { entityId: true },
        });
        if (!parent || parent.entityId !== update.id)
          throw invalid([
            { path: 'parentId', message: 'Reply to a comment on this update' },
          ]);
      }
      const kind: CommentKind =
        relation === 'OWNER' && update.status === 'CHALLENGED'
          ? 'RESPONSE'
          : 'COMMENT';
      await this.addComment(
        tx,
        caller,
        update.id,
        input.body,
        kind,
        input.parentId,
      );
      return this.buildForm(tx, caller, periodId, initiativeId);
    });
  }

  // ---------------------------------------------------------------------------

  private async writeDraft(
    tx: TenantTransactionClient,
    caller: AuthContext,
    periodId: string,
    initiativeId: string,
    input: UpdateDraftInput,
  ) {
    const period = await tx.reportingPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period) throw periodNotFound();
    if (period.status === 'LOCKED') {
      throw new ConflictException({
        code: 'PERIOD_LOCKED',
        message: `${period.name} is locked.`,
      });
    }
    const initiative = await this.visibleInitiative(tx, caller, initiativeId);
    const relation = relationTo(caller, initiative);
    if (relation !== 'OWNER' && relation !== 'OFFICE') {
      throw new ForbiddenException({
        code: 'OWNER_ONLY',
        message:
          'Only the initiative’s owner (or the Strategy Office) can write its update.',
      });
    }
    if (!['ACTIVE', 'ON_HOLD'].includes(initiative.status)) {
      throw new ConflictException({
        code: 'INITIATIVE_NOT_ACTIVE',
        message: 'Only active initiatives report progress.',
      });
    }

    const milestones = await tx.milestone.findMany({
      where: { initiativeId, status: { not: 'CANCELLED' } },
      select: { id: true, title: true, verifiedCompletion: true },
    });
    const byId = new Map(milestones.map((m) => [m.id, m]));
    const errors = input.lines.flatMap((line, index) => {
      const milestone = byId.get(line.milestoneId);
      if (!milestone)
        return [
          {
            path: `lines.${index}.milestoneId`,
            message: 'Not a milestone of this initiative',
          },
        ];
      if (
        toNumber(milestone.verifiedCompletion) >= 100 &&
        line.claimedCompletion !== 100
      ) {
        return [
          {
            path: `lines.${index}.claimedCompletion`,
            message: `${milestone.title} is verified complete and locked`,
          },
        ];
      }
      return [];
    });
    if (errors.length) throw invalid(errors);

    let update = await tx.statusUpdate.findUnique({
      where: { initiativeId_periodId: { initiativeId, periodId } },
    });
    if (update && !canPerform('EDIT', update.status))
      throw wrongStatus(update.status, 'changed');

    const commentary = {
      progressNarrative: input.progressNarrative,
      varianceExplanation: input.varianceExplanation,
      recoveryAction: input.recoveryAction,
      nextSteps: input.nextSteps,
      needsDecision: input.needsDecision,
    };
    if (!update) {
      update = await tx.statusUpdate.create({
        data: {
          id: uuidv7(),
          organisationId: TenantContext.require().organisationId,
          initiativeId,
          periodId,
          submittedById: caller.membershipId,
          claimedProgress: 0,
          healthAtSubmission: 'UNKNOWN',
          status: 'DRAFT',
          ...commentary,
          needsDecision: input.needsDecision ?? false,
        },
      });
    } else {
      await tx.statusUpdate.update({
        where: { id: update.id },
        data: commentary,
      });
    }

    for (const line of input.lines) {
      const milestone = byId.get(line.milestoneId)!;
      const values = {
        claimedCompletion: line.claimedCompletion,
        forecastDate:
          line.forecastDate === undefined
            ? undefined
            : line.forecastDate
              ? new Date(`${line.forecastDate}T00:00:00Z`)
              : null,
        note: line.note,
      };
      await tx.statusUpdateLine.upsert({
        where: {
          updateId_milestoneId: {
            updateId: update.id,
            milestoneId: line.milestoneId,
          },
        },
        create: {
          id: uuidv7(),
          organisationId: TenantContext.require().organisationId,
          updateId: update.id,
          milestoneId: line.milestoneId,
          previousVerified: milestone.verifiedCompletion,
          ...values,
          note: line.note ?? null,
        },
        update: values,
      });
    }
  }

  private async buildForm(
    tx: TenantTransactionClient,
    caller: AuthContext,
    periodId: string,
    initiativeId: string,
  ): Promise<UpdateForm> {
    const period = await tx.reportingPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period) throw periodNotFound();
    const initiative = await this.visibleInitiative(tx, caller, initiativeId);
    const relation = relationTo(caller, initiative);
    if (relation === 'NONE' && !seesAllInitiatives(caller)) {
      throw new ForbiddenException({
        code: 'NOT_ACCOUNTABLE',
        message: 'You cannot see this update.',
      });
    }

    const [details, update, rules] = await Promise.all([
      tx.initiative.findUniqueOrThrow({
        where: { id: initiativeId },
        select: {
          baselineStart: true,
          owner: personSelect,
          sponsor: personSelect,
          milestones: {
            where: { status: { not: 'CANCELLED' } },
            orderBy: [{ sortOrder: 'asc' }, { baselineDate: 'asc' }],
          },
          risks: {
            where: { status: 'OPEN' },
            select: { id: true, type: true, title: true, severity: true },
          },
        },
      }),
      tx.statusUpdate.findUnique({
        where: { initiativeId_periodId: { initiativeId, periodId } },
        include: { lines: true, submittedBy: personSelect },
      }),
      this.recalculation.loadActiveRules(tx),
    ]);
    const milestoneIds = details.milestones.map((m) => m.id);
    const lineIds = update?.lines.map((l) => l.id) ?? [];
    const [evidence, comments] = await Promise.all([
      tx.document.groupBy({
        by: ['entityId'],
        where: {
          deletedAt: null,
          OR: [
            { entityType: 'Milestone', entityId: { in: milestoneIds } },
            { entityType: 'StatusUpdateLine', entityId: { in: lineIds } },
          ],
        },
        _count: { _all: true },
      }),
      update
        ? tx.comment.findMany({
            where: { entityType: 'StatusUpdate', entityId: update.id },
            orderBy: { createdAt: 'asc' },
            include: { author: personSelect },
          })
        : Promise.resolve([]),
    ]);
    const evidenceCount = new Map(
      evidence.map((e) => [e.entityId, e._count._all]),
    );
    const lineByMilestone = new Map(
      update?.lines.map((l) => [l.milestoneId, l]),
    );

    const now = this.clock.now();
    const facts: (UpdateLineFacts & {
      m: (typeof details.milestones)[number];
    })[] = details.milestones.map((m) => {
      const line = lineByMilestone.get(m.id);
      const lastVerified = line
        ? toNumber(line.previousVerified)
        : toNumber(m.verifiedCompletion);
      const locked = toNumber(m.verifiedCompletion) >= 100;
      return {
        m,
        milestoneId: m.id,
        title: m.title,
        weight: toNumber(m.weight),
        lastVerified,
        claimed: line ? toNumber(line.claimedCompletion) : locked ? 100 : null,
        evidenceRequired: m.evidenceRequired,
        evidenceCount:
          (evidenceCount.get(m.id) ?? 0) +
          (line ? (evidenceCount.get(line.id) ?? 0) : 0),
      };
    });
    const planned = plannedCompletion(
      details.milestones.map((m) => ({
        weight: toNumber(m.weight),
        verifiedCompletion: 0,
        baselineStartDate: m.baselineStartDate,
        baselineDate: m.baselineDate,
      })),
      now,
      details.baselineStart,
    );
    const evaluation = evaluateUpdate(
      facts,
      planned,
      {
        progressNarrative: update?.progressNarrative ?? null,
        varianceExplanation: update?.varianceExplanation ?? null,
        recoveryAction: update?.recoveryAction ?? null,
      },
      rules.config,
    );
    const preview = await this.recalculation.previewHealth(
      tx,
      initiativeId,
      evaluation.claimedCompletion,
    );
    const status = update?.status;
    const ownerOrOffice = relation === 'OWNER' || relation === 'OFFICE';
    const open = period.status !== 'LOCKED';

    return {
      period: {
        id: period.id,
        name: period.name,
        status: period.status,
        submissionDueAt: period.submissionDueAt?.toISOString() ?? null,
        locked: !open,
      },
      initiative: {
        id: initiative.id,
        code: initiative.code,
        title: initiative.title,
        owner: toPersonRef(details.owner),
        sponsor: toPersonRef(details.sponsor),
      },
      update: update
        ? {
            id: update.id,
            status: update.status,
            submittedBy: toPersonRef(update.submittedBy),
            savedAt: update.updatedAt.toISOString(),
            submittedAt: update.submittedAt?.toISOString() ?? null,
            reviewedAt: update.reviewedAt?.toISOString() ?? null,
            approvedAt: update.approvedAt?.toISOString() ?? null,
            claimedProgress: toNumber(update.claimedProgress),
            verifiedProgress: toNumber(update.verifiedProgress),
            progressNarrative: update.progressNarrative,
            varianceExplanation: update.varianceExplanation,
            recoveryAction: update.recoveryAction,
            nextSteps: update.nextSteps,
            needsDecision: update.needsDecision,
          }
        : null,
      lines: facts.map((f) => {
        const line = lineByMilestone.get(f.milestoneId);
        return {
          milestoneId: f.milestoneId,
          title: f.title,
          weight: f.weight,
          isCritical: f.m.isCritical,
          baselineDate: toIsoDate(f.m.baselineDate),
          forecastDate: toIsoDate(line?.forecastDate ?? f.m.forecastDate),
          lastVerified: f.lastVerified,
          claimed: f.claimed,
          verified: line ? toNumber(line.verifiedCompletion) : null,
          locked: toNumber(f.m.verifiedCompletion) >= 100,
          evidenceRequired: f.evidenceRequired,
          evidenceCount: f.evidenceCount,
          needsEvidence: evaluation.needsEvidence.includes(f.milestoneId),
          note: line?.note ?? null,
        };
      }),
      evaluation: { ...evaluation, healthPreview: preview?.health ?? null },
      risks: details.risks,
      comments: comments.map((c) => ({
        id: c.id,
        parentId: c.parentId,
        kind: c.kind,
        body: c.body,
        author: toPersonRef(c.author),
        at: c.createdAt.toISOString(),
      })),
      can: {
        edit: open && ownerOrOffice && (!status || canPerform('EDIT', status)),
        submit:
          open &&
          ownerOrOffice &&
          (!status || canPerform('SUBMIT', status)) &&
          evaluation.canSubmit,
        verify:
          open &&
          relation === 'OFFICE' &&
          status !== undefined &&
          canPerform('VERIFY', status),
        challenge:
          open &&
          status !== undefined &&
          ((relation === 'OFFICE' && canPerform('CHALLENGE', status)) ||
            (relation === 'SPONSOR' && status === 'REVIEWED')),
        approve:
          open &&
          (relation === 'SPONSOR' || relation === 'OFFICE') &&
          status !== undefined &&
          canPerform('APPROVE', status as UpdateStatus),
        comment: relation !== 'NONE' && status !== undefined,
      },
    };
  }

  private async context(
    tx: TenantTransactionClient,
    caller: AuthContext,
    periodId: string,
    initiativeId: string,
  ) {
    const period = await tx.reportingPeriod.findUnique({
      where: { id: periodId },
      select: { status: true, name: true },
    });
    if (!period) throw periodNotFound();
    if (period.status === 'LOCKED') {
      throw new ConflictException({
        code: 'PERIOD_LOCKED',
        message: `${period.name} is locked.`,
      });
    }
    const initiative = await this.visibleInitiative(tx, caller, initiativeId);
    const update = await tx.statusUpdate.findUnique({
      where: { initiativeId_periodId: { initiativeId, periodId } },
    });
    if (!update) throw updateNotFound();
    return { update, relation: relationTo(caller, initiative) };
  }

  private async visibleInitiative(
    tx: TenantTransactionClient,
    caller: AuthContext,
    initiativeId: string,
  ) {
    const initiative = await tx.initiative.findUnique({
      where: { id: initiativeId },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        isSensitive: true,
        ownerId: true,
        sponsorId: true,
        benefitsOwnerId: true,
      },
    });
    if (!initiative || !canSeeInitiative(caller, initiative)) {
      throw new NotFoundException({
        code: 'INITIATIVE_NOT_FOUND',
        message: 'Initiative not found.',
      });
    }
    return initiative;
  }

  private addComment(
    tx: TenantTransactionClient,
    caller: AuthContext,
    updateId: string,
    body: string,
    kind: CommentKind,
    parentId?: string,
  ) {
    return tx.comment.create({
      data: {
        id: uuidv7(),
        organisationId: TenantContext.require().organisationId,
        entityType: 'StatusUpdate',
        entityId: updateId,
        parentId: parentId ?? null,
        authorId: caller.membershipId,
        kind,
        body,
      },
    });
  }
}

function officeOnly(action: string) {
  return new ForbiddenException({
    code: 'STRATEGY_OFFICE_ONLY',
    message: `Only the Strategy Office can ${action}.`,
  });
}
