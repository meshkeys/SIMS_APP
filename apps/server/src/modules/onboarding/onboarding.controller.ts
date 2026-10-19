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
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { Roles } from '../auth/index.js';
import { CustomFieldsService } from './custom-fields.service.js';
import { OnboardingService } from './onboarding.service.js';
import {
  type CreateCustomFieldInput,
  createCustomFieldSchema,
  type CustomFieldView,
  idSchema,
  ONBOARDING_ROLES,
  type OnboardingFrameworkInput,
  onboardingFrameworkSchema,
  type OnboardingGovernanceInput,
  onboardingGovernanceSchema,
  type OnboardingOrganisationInput,
  onboardingOrganisationSchema,
  type OnboardingState,
  type OnboardingVisionInput,
  onboardingVisionSchema,
} from '@sims/contracts';

/** Workspace set-up, one save per wizard step, and custom fields. */
@Controller()
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly customFields: CustomFieldsService,
  ) {}

  @Roles(...ONBOARDING_ROLES)
  @Get('onboarding')
  state(): Promise<OnboardingState> {
    return this.onboarding.state();
  }

  @Roles(...ONBOARDING_ROLES)
  @Put('onboarding/organisation')
  saveOrganisation(
    @Body(new ZodValidationPipe(onboardingOrganisationSchema))
    input: OnboardingOrganisationInput,
  ): Promise<OnboardingState> {
    return this.onboarding.saveOrganisation(input);
  }

  @Roles(...ONBOARDING_ROLES)
  @Put('onboarding/framework')
  saveFramework(
    @Body(new ZodValidationPipe(onboardingFrameworkSchema))
    input: OnboardingFrameworkInput,
  ): Promise<OnboardingState> {
    return this.onboarding.saveFramework(input);
  }

  @Roles(...ONBOARDING_ROLES)
  @Put('onboarding/vision')
  saveVision(
    @Body(new ZodValidationPipe(onboardingVisionSchema))
    input: OnboardingVisionInput,
  ): Promise<OnboardingState> {
    return this.onboarding.saveVision(input);
  }

  @Roles(...ONBOARDING_ROLES)
  @Put('onboarding/governance')
  saveGovernance(
    @Body(new ZodValidationPipe(onboardingGovernanceSchema))
    input: OnboardingGovernanceInput,
  ): Promise<OnboardingState> {
    return this.onboarding.saveGovernance(input);
  }

  @Roles(...ONBOARDING_ROLES)
  @Post('onboarding/complete')
  @HttpCode(HttpStatus.OK)
  complete(): Promise<OnboardingState> {
    return this.onboarding.complete();
  }

  @Get('custom-fields')
  listCustomFields(): Promise<CustomFieldView[]> {
    return this.customFields.list();
  }

  @Roles(...ONBOARDING_ROLES)
  @Post('custom-fields')
  createCustomField(
    @Body(new ZodValidationPipe(createCustomFieldSchema))
    input: CreateCustomFieldInput,
  ): Promise<CustomFieldView> {
    return this.customFields.create(input);
  }

  @Roles(...ONBOARDING_ROLES)
  @Delete('custom-fields/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCustomField(
    @Param('id', new ZodValidationPipe(idSchema)) fieldId: string,
  ): Promise<void> {
    return this.customFields.remove(fieldId);
  }
}
