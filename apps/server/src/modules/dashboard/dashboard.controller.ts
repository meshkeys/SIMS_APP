import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { type AuthContext, CurrentAuth } from '../auth/index.js';
import { DashboardService } from './dashboard.service.js';
import {
  type Dashboard,
  type DashboardQuery,
  dashboardQuerySchema,
} from '@sims/contracts';

/** The Strategy Execution Command Centre. */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Everything the Command Centre shows, for the whole plan or one element. */
  @Get()
  get(
    @CurrentAuth() viewer: AuthContext,
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
  ): Promise<Dashboard> {
    return this.dashboard.get(viewer, query);
  }
}
