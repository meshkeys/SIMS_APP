import {
  Body,
  Controller,
  Delete,
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
import {
  idSchema,
  type OverrideInput,
  overrideSchema,
  type RegisterQuery,
  registerQuerySchema,
} from './delivery.schemas.js';
import {
  HealthRecalculationService,
  type RecalculationSummary,
} from './health-recalculation.service.js';
import {
  InitiativeRegisterService,
  type RegisterPage,
} from './initiative-register.service.js';
import {
  type InitiativeDetail,
  InitiativesService,
} from './initiatives.service.js';

const id = new ZodValidationPipe(idSchema);

@Controller('initiatives')
export class InitiativesController {
  constructor(
    private readonly register: InitiativeRegisterService,
    private readonly initiatives: InitiativesService,
    private readonly recalculation: HealthRecalculationService,
  ) {}

  /** The Initiative register: tabs, health chips, filters, sorting and pages. */
  @Get()
  list(
    @CurrentAuth() caller: AuthContext,
    @Query(new ZodValidationPipe(registerQuerySchema)) query: RegisterQuery,
  ): Promise<RegisterPage> {
    return this.register.list(caller, query);
  }

  /**
   * Recalculate progress and health for every active initiative now (also
   * runs automatically after changes and, with the jobs module, nightly).
   */
  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('recalculate')
  @HttpCode(HttpStatus.OK)
  recalculate(): Promise<RecalculationSummary> {
    return this.recalculation.recalculateAll();
  }

  /** Everything the Initiative detail screen shows. */
  @Get(':id')
  detail(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) initiativeId: string,
  ): Promise<InitiativeDetail> {
    return this.initiatives.detail(caller, initiativeId);
  }

  /** Override the calculated status (reason and expiry required; permission from the ruleset). */
  @Put(':id/override')
  setOverride(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) initiativeId: string,
    @Body(new ZodValidationPipe(overrideSchema)) input: OverrideInput,
  ): Promise<InitiativeDetail> {
    return this.initiatives.setOverride(caller, initiativeId, input);
  }

  @Delete(':id/override')
  clearOverride(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) initiativeId: string,
  ): Promise<InitiativeDetail> {
    return this.initiatives.clearOverride(caller, initiativeId);
  }
}
