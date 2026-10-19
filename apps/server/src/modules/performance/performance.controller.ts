import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { type AuthContext, CurrentAuth } from '../auth/index.js';
import { PerformanceService } from './performance.service.js';
import {
  type Performance,
  type PerformanceQuery,
  performanceQuerySchema,
} from '@sims/contracts';

/** KPIs and benefits realisation: the strategic impact lens. */
@Controller('performance')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  /** Benefits by quarter, KPI trajectories, the scorecard and low-value work, for one year. */
  @Get()
  get(
    @CurrentAuth() viewer: AuthContext,
    @Query(new ZodValidationPipe(performanceQuerySchema))
    query: PerformanceQuery,
  ): Promise<Performance> {
    return this.performance.get(viewer, query);
  }
}
