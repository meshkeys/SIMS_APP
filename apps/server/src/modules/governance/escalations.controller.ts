import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import { type AuthContext, CurrentAuth, Roles } from '../auth/index.js';
import { EscalationsService } from './escalations.service.js';
import {
  type DependencyQuery,
  dependencyQuerySchema,
  type EscalationCentre,
  type EscalationDetail,
  type EscalationQuery,
  escalationQuerySchema,
  idSchema,
  type MoveEscalationInput,
  moveEscalationSchema,
  type PortfolioDependency,
  type RaiseEscalationInput,
  raiseEscalationSchema,
  type ResolveEscalationInput,
  resolveEscalationSchema,
  type SweepResult,
  type WithdrawEscalationInput,
  withdrawEscalationSchema,
} from '@sims/contracts';

const id = new ZodValidationPipe(idSchema);
const move = new ZodValidationPipe(moveEscalationSchema);

/** The escalation centre: the ladder, its items, and blocked dependencies. */
@Controller()
export class EscalationsController {
  constructor(private readonly escalations: EscalationsService) {}

  /** The ladder with counts and the items, oldest first (open by default). */
  @Get('escalations')
  list(
    @CurrentAuth() caller: AuthContext,
    @Query(new ZodValidationPipe(escalationQuerySchema)) query: EscalationQuery,
  ): Promise<EscalationCentre> {
    return this.escalations.list(caller, query);
  }

  @Post('escalations')
  @HttpCode(HttpStatus.CREATED)
  raise(
    @CurrentAuth() caller: AuthContext,
    @Body(new ZodValidationPipe(raiseEscalationSchema))
    input: RaiseEscalationInput,
  ): Promise<EscalationDetail> {
    return this.escalations.raise(caller, input);
  }

  /** Applies the automatic moves that are due (normally done on every read). */
  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('escalations/sweep')
  @HttpCode(HttpStatus.OK)
  sweep(): Promise<SweepResult> {
    return this.escalations.sweep();
  }

  @Get('escalations/:id')
  get(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) escalationId: string,
  ): Promise<EscalationDetail> {
    return this.escalations.get(caller, escalationId);
  }

  @Post('escalations/:id/escalate')
  @HttpCode(HttpStatus.OK)
  escalate(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) escalationId: string,
    @Body(move) input: MoveEscalationInput,
  ): Promise<EscalationDetail> {
    return this.escalations.escalate(caller, escalationId, input);
  }

  @Post('escalations/:id/de-escalate')
  @HttpCode(HttpStatus.OK)
  deEscalate(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) escalationId: string,
    @Body(move) input: MoveEscalationInput,
  ): Promise<EscalationDetail> {
    return this.escalations.deEscalate(caller, escalationId, input);
  }

  @Post('escalations/:id/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) escalationId: string,
    @Body(new ZodValidationPipe(resolveEscalationSchema))
    input: ResolveEscalationInput,
  ): Promise<EscalationDetail> {
    return this.escalations.resolve(caller, escalationId, input);
  }

  @Post('escalations/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) escalationId: string,
    @Body(new ZodValidationPipe(withdrawEscalationSchema))
    input: WithdrawEscalationInput,
  ): Promise<EscalationDetail> {
    return this.escalations.withdraw(caller, escalationId, input);
  }

  /** Blocked and at-risk dependencies across the portfolio. */
  @Get('dependencies')
  dependencies(
    @CurrentAuth() caller: AuthContext,
    @Query(new ZodValidationPipe(dependencyQuerySchema)) query: DependencyQuery,
  ): Promise<PortfolioDependency[]> {
    return this.escalations.dependencies(caller, query);
  }
}
