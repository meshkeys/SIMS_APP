import { Module } from '@nestjs/common';
import { AuthDirectory } from './auth-directory.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import { EmailVerificationController } from './email-verification.controller.js';
import { EmailVerificationService } from './email-verification.service.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PasswordResetController } from './password-reset.controller.js';
import { PasswordResetService } from './password-reset.service.js';
import { TenantContextInterceptor } from './tenant-context.interceptor.js';
import { AccessTokenService } from './tokens/access-token.service.js';
import { RefreshTokenService } from './tokens/refresh-token.service.js';

/**
 * Authentication and session management. The guards and interceptor are
 * registered globally (in AppModule, so their order is explicit).
 */
@Module({
  controllers: [
    AuthController,
    PasswordResetController,
    EmailVerificationController,
  ],
  providers: [
    AuthService,
    AuthDirectory,
    PasswordResetService,
    EmailVerificationService,
    AccessTokenService,
    RefreshTokenService,
    AccessTokenGuard,
    RolesGuard,
    TenantContextInterceptor,
  ],
  exports: [
    AuthService,
    AuthDirectory,
    AccessTokenGuard,
    RolesGuard,
    TenantContextInterceptor,
  ],
})
export class AuthModule {}
