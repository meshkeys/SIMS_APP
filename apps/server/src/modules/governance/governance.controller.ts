import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import { type AuthContext, CurrentAuth, Roles } from '../auth/index.js';
import { ChangeRequestsService } from './change-requests.service.js';
import { DecisionsService } from './decisions.service.js';
import { RisksService } from './risks.service.js';
import {
  type ChangeRequestQuery,
  changeRequestQuerySchema,
  type ChangeRequestView,
  type CreateChangeRequestInput,
  createChangeRequestSchema,
  type CreateDecisionInput,
  createDecisionSchema,
  type CreateRiskInput,
  createRiskSchema,
  type DecideInput,
  decideSchema,
  type DecisionPage,
  type DecisionQuery,
  decisionQuerySchema,
  type DecisionView,
  idSchema,
  type RiskQuery,
  riskQuerySchema,
  type RiskRegister,
  type RiskView,
  type UpdateRiskInput,
  updateRiskSchema,
} from '@sims/contracts';

const id = new ZodValidationPipe(idSchema);

/** Risks and issues, decisions, and maker-checker change requests. */
@Controller()
export class GovernanceController {
  constructor(
    private readonly risks: RisksService,
    private readonly decisions: DecisionsService,
    private readonly changeRequests: ChangeRequestsService,
  ) {}

  // ------------------------------------------------------------------ risks

  /** Register with heatmap; open items by default (`?status=OPEN,MITIGATED,CLOSED`). */
  @Get('risks')
  listRisks(
    @CurrentAuth() caller: AuthContext,
    @Query(new ZodValidationPipe(riskQuerySchema)) query: RiskQuery,
  ): Promise<RiskRegister> {
    return this.risks.list(caller, query);
  }

  @Get('risks/:id')
  getRisk(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) riskId: string,
  ): Promise<RiskView> {
    return this.risks.get(caller, riskId);
  }

  @Post('risks')
  @HttpCode(HttpStatus.CREATED)
  createRisk(
    @CurrentAuth() caller: AuthContext,
    @Body(new ZodValidationPipe(createRiskSchema)) input: CreateRiskInput,
  ): Promise<RiskView> {
    return this.risks.create(caller, input);
  }

  @Patch('risks/:id')
  updateRisk(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) riskId: string,
    @Body(new ZodValidationPipe(updateRiskSchema)) input: UpdateRiskInput,
  ): Promise<RiskView> {
    return this.risks.update(caller, riskId, input);
  }

  // -------------------------------------------------------------- decisions

  /** `?view=open` (default): "Decisions required"; `?view=log`: the decision log. */
  @Get('decisions')
  listDecisions(
    @CurrentAuth() caller: AuthContext,
    @Query(new ZodValidationPipe(decisionQuerySchema)) query: DecisionQuery,
  ): Promise<DecisionPage> {
    return this.decisions.list(caller, query);
  }

  @Get('decisions/:id')
  getDecision(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) decisionId: string,
  ): Promise<DecisionView> {
    return this.decisions.get(caller, decisionId);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('decisions')
  @HttpCode(HttpStatus.CREATED)
  createDecision(
    @CurrentAuth() caller: AuthContext,
    @Body(new ZodValidationPipe(createDecisionSchema))
    input: CreateDecisionInput,
  ): Promise<DecisionView> {
    return this.decisions.create(caller, input);
  }

  /** Approve, reject or defer. For change requests, approving applies the change. */
  @Post('decisions/:id/decide')
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) decisionId: string,
    @Body(new ZodValidationPipe(decideSchema)) input: DecideInput,
  ): Promise<DecisionView> {
    return this.decisions.decide(caller, decisionId, input);
  }

  // -------------------------------------------------------- change requests

  /** Request a change to an active initiative's baseline, budget or scope. */
  @Post('initiatives/:id/change-requests')
  @HttpCode(HttpStatus.CREATED)
  requestChange(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) initiativeId: string,
    @Body(new ZodValidationPipe(createChangeRequestSchema))
    input: CreateChangeRequestInput,
  ): Promise<ChangeRequestView> {
    return this.changeRequests.create(caller, initiativeId, input);
  }

  @Get('change-requests')
  listChangeRequests(
    @CurrentAuth() caller: AuthContext,
    @Query(new ZodValidationPipe(changeRequestQuerySchema))
    query: ChangeRequestQuery,
  ): Promise<ChangeRequestView[]> {
    return this.changeRequests.list(caller, query);
  }

  @Get('change-requests/:id')
  getChangeRequest(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) approvalId: string,
  ): Promise<ChangeRequestView> {
    return this.changeRequests.get(caller, approvalId);
  }

  @Post('change-requests/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) approvalId: string,
  ): Promise<ChangeRequestView> {
    return this.changeRequests.withdraw(caller, approvalId);
  }
}
