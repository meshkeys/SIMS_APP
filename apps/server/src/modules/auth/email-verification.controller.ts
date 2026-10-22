import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { StrictRateLimit } from '../../common/http/rate-limit.js';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import type { AuthContext } from './auth-context.js';
import { CurrentAuth, Public } from './decorators.js';
import { EmailVerificationService } from './email-verification.service.js';
import {
  type EmailVerificationResult,
  type EmailVerificationTokenInput,
  emailVerificationTokenSchema,
} from '@sims/contracts';

/** Confirming the email address a person signed up with. */
@Controller('auth/verify-email')
export class EmailVerificationController {
  constructor(private readonly verification: EmailVerificationService) {}

  /** Opens the emailed link; works without signing in. */
  @Public()
  @StrictRateLimit()
  @Post()
  @HttpCode(HttpStatus.OK)
  verify(
    @Body(new ZodValidationPipe(emailVerificationTokenSchema))
    input: EmailVerificationTokenInput,
  ): Promise<EmailVerificationResult> {
    return this.verification.verify(input.token);
  }

  @StrictRateLimit()
  @Post('resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  resend(@CurrentAuth() caller: AuthContext): Promise<void> {
    return this.verification.resend(caller.userId);
  }
}
