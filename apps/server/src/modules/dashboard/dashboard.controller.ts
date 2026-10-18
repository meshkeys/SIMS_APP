import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { type AuthContext, CurrentAuth } from '../auth/index.js';
import { type Dashboard, DashboardService } from './dashboard.service.js';
import {
  type DashboardQuery,
  dashboardQuerySchema,
} from './dashboard.schemas.js';

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
