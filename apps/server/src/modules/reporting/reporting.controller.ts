import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import { type AuthContext, CurrentAuth, Roles } from '../auth/index.js';
import { type PeriodSummary, PeriodsService } from './periods.service.js';
import {
  type ApproveInput,
  approveSchema,
  type ChallengeInput,
  challengeSchema,
  type CommentInput,
  commentSchema,
  idSchema,
  type LockPeriodInput,
  lockPeriodSchema,
  type OpenPeriodInput,
  openPeriodSchema,
  type UpdateDraftInput,
  updateDraftSchema,
  type UpdatesQuery,
  updatesQuerySchema,
  type VerifyInput,
  verifySchema,
} from './reporting.schemas.js';
import {
  type MyUpdates,
  type UpdateForm,
  type UpdateListItem,
  UpdatesService,
} from './updates.service.js';

const id = new ZodValidationPipe(idSchema);

/** The monthly reporting cycle: periods, owner updates, verification, approval. */
@Controller()
export class ReportingController {
  constructor(
    private readonly periods: PeriodsService,
    private readonly updates: UpdatesService,
  ) {}

  // ----------------------------------------------------------------- periods

  @Get('periods')
  list(): Promise<PeriodSummary[]> {
    return this.periods.list();
  }

  /** The cycle in progress, for the tracker ("Day 6 of 8 · 29 of 32 in"); null between cycles. */
  @Get('periods/current')
  current(): Promise<PeriodSummary | null> {
    return this.periods.current();
  }

  @Get('periods/:id')
  get(@Param('id', id) periodId: string): Promise<PeriodSummary> {
    return this.periods.get(periodId);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('periods')
  @HttpCode(HttpStatus.CREATED)
  open(
    @Body(new ZodValidationPipe(openPeriodSchema)) input: OpenPeriodInput,
  ): Promise<PeriodSummary> {
    return this.periods.open(input);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('periods/:id/advance')
  @HttpCode(HttpStatus.OK)
  advance(@Param('id', id) periodId: string): Promise<PeriodSummary> {
    return this.periods.advance(periodId);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('periods/:id/lock')
  @HttpCode(HttpStatus.OK)
  lock(
    @Param('id', id) periodId: string,
    @Body(new ZodValidationPipe(lockPeriodSchema)) input: LockPeriodInput,
  ): Promise<PeriodSummary> {
    return this.periods.lock(periodId, input);
  }

  // ----------------------------------------------------------------- updates

  /** "My updates": what the caller owes this cycle, most urgent first. */
  @Get('my-updates')
  mine(@CurrentAuth() caller: AuthContext): Promise<MyUpdates> {
    return this.updates.mine(caller);
  }

  /** Updates in a period: the Strategy Office review queue; sponsors and owners see their own. */
  @Get('periods/:id/updates')
  updatesOf(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) periodId: string,
    @Query(new ZodValidationPipe(updatesQuerySchema)) query: UpdatesQuery,
  ): Promise<UpdateListItem[]> {
    return this.updates.list(caller, periodId, query);
  }

  /** The update form for one initiative (works before a draft exists). */
  @Get('periods/:periodId/updates/:initiativeId')
  form(
    @CurrentAuth() caller: AuthContext,
    @Param('periodId', id) periodId: string,
    @Param('initiativeId', id) initiativeId: string,
  ): Promise<UpdateForm> {
    return this.updates.form(caller, periodId, initiativeId);
  }

  @Put('periods/:periodId/updates/:initiativeId')
  saveDraft(
    @CurrentAuth() caller: AuthContext,
    @Param('periodId', id) periodId: string,
    @Param('initiativeId', id) initiativeId: string,
    @Body(new ZodValidationPipe(updateDraftSchema)) input: UpdateDraftInput,
  ): Promise<UpdateForm> {
    return this.updates.saveDraft(caller, periodId, initiativeId, input);
  }

  @Post('periods/:periodId/updates/:initiativeId/submit')
  @HttpCode(HttpStatus.OK)
  submit(
    @CurrentAuth() caller: AuthContext,
    @Param('periodId', id) periodId: string,
    @Param('initiativeId', id) initiativeId: string,
    @Body(new ZodValidationPipe(updateDraftSchema)) input: UpdateDraftInput,
  ): Promise<UpdateForm> {
    return this.updates.submit(caller, periodId, initiativeId, input);
  }

  @Post('periods/:periodId/updates/:initiativeId/verify')
  @HttpCode(HttpStatus.OK)
  verify(
    @CurrentAuth() caller: AuthContext,
    @Param('periodId', id) periodId: string,
    @Param('initiativeId', id) initiativeId: string,
    @Body(new ZodValidationPipe(verifySchema)) input: VerifyInput,
  ): Promise<UpdateForm> {
    return this.updates.verify(caller, periodId, initiativeId, input);
  }

  @Post('periods/:periodId/updates/:initiativeId/challenge')
  @HttpCode(HttpStatus.OK)
  challenge(
    @CurrentAuth() caller: AuthContext,
    @Param('periodId', id) periodId: string,
    @Param('initiativeId', id) initiativeId: string,
    @Body(new ZodValidationPipe(challengeSchema)) input: ChallengeInput,
  ): Promise<UpdateForm> {
    return this.updates.challenge(caller, periodId, initiativeId, input);
  }

  @Post('periods/:periodId/updates/:initiativeId/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentAuth() caller: AuthContext,
    @Param('periodId', id) periodId: string,
    @Param('initiativeId', id) initiativeId: string,
    @Body(new ZodValidationPipe(approveSchema)) input: ApproveInput,
  ): Promise<UpdateForm> {
    return this.updates.approve(caller, periodId, initiativeId, input);
  }

  @Post('periods/:periodId/updates/:initiativeId/comments')
  @HttpCode(HttpStatus.CREATED)
  comment(
    @CurrentAuth() caller: AuthContext,
    @Param('periodId', id) periodId: string,
    @Param('initiativeId', id) initiativeId: string,
    @Body(new ZodValidationPipe(commentSchema)) input: CommentInput,
  ): Promise<UpdateForm> {
    return this.updates.comment(caller, periodId, initiativeId, input);
  }
}
