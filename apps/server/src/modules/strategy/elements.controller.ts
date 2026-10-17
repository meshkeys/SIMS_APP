import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import { type AuthContext, CurrentAuth, Roles } from '../auth/index.js';
import { type ElementDetail, ElementsService } from './elements.service.js';
import {
  idSchema,
  type UpdateElementInput,
  updateElementSchema,
} from './strategy.schemas.js';

const elementId = new ZodValidationPipe(idSchema);

@Controller('elements')
export class ElementsController {
  constructor(private readonly elements: ElementsService) {}

  /** The selected element: KPIs with progress to target, contributing initiatives, sub-items. */
  @Get(':id')
  detail(
    @CurrentAuth() caller: AuthContext,
    @Param('id', elementId) id: string,
  ): Promise<ElementDetail> {
    return this.elements.detail(caller, id);
  }

  /** Edit, reassign, renumber, reorder or move under another parent. */
  @Roles(...STRATEGY_EDITOR_ROLES)
  @Patch(':id')
  update(
    @CurrentAuth() caller: AuthContext,
    @Param('id', elementId) id: string,
    @Body(new ZodValidationPipe(updateElementSchema)) input: UpdateElementInput,
  ): Promise<ElementDetail> {
    return this.elements.update(caller, id, input);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', elementId) id: string): Promise<void> {
    return this.elements.remove(id);
  }
}
