import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import { type AuthContext, CurrentAuth, Roles } from '../auth/index.js';
import { KpiActualsService } from './kpi-actuals.service.js';
import { KpisService } from './kpis.service.js';
import {
  type CreateKpiInput,
  createKpiSchema,
  idSchema,
  type KpiDetail,
  type KpiListItem,
  type KpiListQuery,
  kpiListQuerySchema,
  type KpiActualsSheet,
  type KpiTargetsInput,
  kpiTargetsSchema,
  type RecordKpiActualsInput,
  recordKpiActualsSchema,
  type UpdateKpiInput,
  updateKpiSchema,
  type VerifyKpiActualsInput,
  verifyKpiActualsSchema,
} from '@sims/contracts';

const id = new ZodValidationPipe(idSchema);

/** KPIs: the measures behind the strategic impact lens. */
@Controller()
export class KpisController {
  constructor(private readonly kpis: KpisService) {}

  /** A plan's KPIs, each with its top-level element; `?elementId=` narrows to one element. */
  @Get('plans/:planId/kpis')
  list(
    @Param('planId', id) planId: string,
    @Query(new ZodValidationPipe(kpiListQuerySchema)) query: KpiListQuery,
  ): Promise<KpiListItem[]> {
    return this.kpis.listForPlan(planId, query.elementId);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('elements/:elementId/kpis')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentAuth() caller: AuthContext,
    @Param('elementId', id) elementId: string,
    @Body(new ZodValidationPipe(createKpiSchema)) input: CreateKpiInput,
  ): Promise<KpiDetail> {
    return this.kpis.create(caller, elementId, input);
  }

  /** Definition, targets, recent actuals and the initiatives expected to move it. */
  @Get('kpis/:id')
  detail(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) kpiId: string,
  ): Promise<KpiDetail> {
    return this.kpis.detail(caller, kpiId);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Patch('kpis/:id')
  update(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) kpiId: string,
    @Body(new ZodValidationPipe(updateKpiSchema)) input: UpdateKpiInput,
  ): Promise<KpiDetail> {
    return this.kpis.update(caller, kpiId, input);
  }

  /** Save the full list of interim targets (FY2025, FY2026…). */
  @Roles(...STRATEGY_EDITOR_ROLES)
  @Put('kpis/:id/targets')
  replaceTargets(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) kpiId: string,
    @Body(new ZodValidationPipe(kpiTargetsSchema)) input: KpiTargetsInput,
  ): Promise<KpiDetail> {
    return this.kpis.replaceTargets(caller, kpiId, input);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Delete('kpis/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', id) kpiId: string): Promise<void> {
    return this.kpis.remove(kpiId);
  }
}

/** KPI readings per reporting period: record, verify, and the sheet to do it on. */
@Controller('periods/:periodId/kpi-actuals')
export class KpiActualsController {
  constructor(private readonly actuals: KpiActualsService) {}

  @Get()
  sheet(
    @CurrentAuth() caller: AuthContext,
    @Param('periodId', id) periodId: string,
  ): Promise<KpiActualsSheet> {
    return this.actuals.sheet(caller, periodId);
  }

  /** KPI owners record their own; the Strategy Office records any (verified at once). */
  @Put()
  record(
    @CurrentAuth() caller: AuthContext,
    @Param('periodId', id) periodId: string,
    @Body(new ZodValidationPipe(recordKpiActualsSchema))
    input: RecordKpiActualsInput,
  ): Promise<KpiActualsSheet> {
    return this.actuals.record(caller, periodId, input);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(
    @CurrentAuth() caller: AuthContext,
    @Param('periodId', id) periodId: string,
    @Body(new ZodValidationPipe(verifyKpiActualsSchema))
    input: VerifyKpiActualsInput,
  ): Promise<KpiActualsSheet> {
    return this.actuals.verify(caller, periodId, input);
  }
}
