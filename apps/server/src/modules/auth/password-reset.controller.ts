import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { StrictRateLimit } from '../../common/http/rate-limit.js';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { clientMeta } from './client-meta.js';
import { Public } from './decorators.js';
import { PasswordResetService } from './password-reset.service.js';
import {
  type PasswordResetCompleteInput,
  passwordResetCompleteSchema,
  type PasswordResetPreview,
  type PasswordResetRequestInput,
  passwordResetRequestSchema,
  type PasswordResetTokenInput,
  passwordResetTokenSchema,
} from '@sims/contracts';

/** "Forgot password": request a link, check it, set a new password. */
@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  /** Always 204, so the form cannot reveal who has an account. */
  @Public()
  @StrictRateLimit()
  @Post('request')
  @HttpCode(HttpStatus.NO_CONTENT)
  request(
    @Body(new ZodValidationPipe(passwordResetRequestSchema))
    input: PasswordResetRequestInput,
    @Req() req: Request,
  ): Promise<void> {
    return this.resets.request(input, clientMeta(req));
  }

  @Public()
  @StrictRateLimit()
  @Post('check')
  @HttpCode(HttpStatus.OK)
  check(
    @Body(new ZodValidationPipe(passwordResetTokenSchema))
    input: PasswordResetTokenInput,
  ): Promise<PasswordResetPreview> {
    return this.resets.check(input.token);
  }

  @Public()
  @StrictRateLimit()
  @Post('complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  complete(
    @Body(new ZodValidationPipe(passwordResetCompleteSchema))
    input: PasswordResetCompleteInput,
  ): Promise<void> {
    return this.resets.complete(input);
  }
}
