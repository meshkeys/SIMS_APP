import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { rateLimitOptions } from './common/http/rate-limit.js';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { DatabaseModule } from './infrastructure/database/index.js';
import { MailModule } from './infrastructure/mail/index.js';
import {
  AccessTokenGuard,
  AuthModule,
  RolesGuard,
  TenantContextInterceptor,
} from './modules/auth/index.js';
import { InvitationsModule } from './modules/invitations/invitations.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    MailModule,
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => rateLimitOptions(env),
    }),
    HealthModule,
    AuthModule,
    InvitationsModule,
  ],
  providers: [
    // Global guards run in this order: rate limit → authentication → roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AccessTokenGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
    // Authenticated requests run inside their organisation's tenant context.
    { provide: APP_INTERCEPTOR, useExisting: TenantContextInterceptor },
  ],
})
export class AppModule {}
