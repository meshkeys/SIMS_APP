import { Module } from '@nestjs/common';
import { AuthDirectory } from './auth-directory.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { TenantContextInterceptor } from './tenant-context.interceptor.js';
import { AccessTokenService } from './tokens/access-token.service.js';
import { RefreshTokenService } from './tokens/refresh-token.service.js';

/**
 * Authentication and session management. The guards and interceptor are
 * registered globally (in AppModule, so their order is explicit).
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthDirectory,
    AccessTokenService,
    RefreshTokenService,
    AccessTokenGuard,
    RolesGuard,
    TenantContextInterceptor,
  ],
  exports: [AccessTokenGuard, RolesGuard, TenantContextInterceptor],
})
export class AuthModule {}
