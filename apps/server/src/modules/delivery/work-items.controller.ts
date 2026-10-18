import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { type AuthContext, CurrentAuth } from '../auth/index.js';
import {
  type CreateTaskInput,
  createTaskSchema,
  idSchema,
  type UpdateDependencyInput,
  updateDependencySchema,
  type UpdateMilestoneInput,
  updateMilestoneSchema,
  type UpdateTaskInput,
  updateTaskSchema,
} from './delivery.schemas.js';
import type { InitiativeDetail } from './initiatives.service.js';
import { WorkItemsService } from './work-items.service.js';

const id = new ZodValidationPipe(idSchema);

/**
 * Milestones, tasks and dependencies addressed by their own id. Each change
 * returns the updated initiative detail, so the screen redraws in one step.
 * Who may change what is decided per initiative (see chapter 13).
 */
@Controller()
export class WorkItemsController {
  constructor(private readonly work: WorkItemsService) {}

  @Patch('milestones/:id')
  updateMilestone(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) milestoneId: string,
    @Body(new ZodValidationPipe(updateMilestoneSchema))
    input: UpdateMilestoneInput,
  ): Promise<InitiativeDetail> {
    return this.work.updateMilestone(caller, milestoneId, input);
  }

  @Delete('milestones/:id')
  removeMilestone(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) milestoneId: string,
  ): Promise<InitiativeDetail> {
    return this.work.removeMilestone(caller, milestoneId);
  }

  @Post('milestones/:id/tasks')
  @HttpCode(HttpStatus.CREATED)
  addTask(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) milestoneId: string,
    @Body(new ZodValidationPipe(createTaskSchema)) input: CreateTaskInput,
  ): Promise<InitiativeDetail> {
    return this.work.addTask(caller, milestoneId, input);
  }

  @Patch('tasks/:id')
  updateTask(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) taskId: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) input: UpdateTaskInput,
  ): Promise<InitiativeDetail> {
    return this.work.updateTask(caller, taskId, input);
  }

  @Delete('tasks/:id')
  removeTask(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) taskId: string,
  ): Promise<InitiativeDetail> {
    return this.work.removeTask(caller, taskId);
  }

  @Patch('dependencies/:id')
  updateDependency(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) dependencyId: string,
    @Body(new ZodValidationPipe(updateDependencySchema))
    input: UpdateDependencyInput,
  ): Promise<InitiativeDetail> {
    return this.work.updateDependency(caller, dependencyId, input);
  }

  @Delete('dependencies/:id')
  removeDependency(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) dependencyId: string,
  ): Promise<InitiativeDetail> {
    return this.work.removeDependency(caller, dependencyId);
  }
}
