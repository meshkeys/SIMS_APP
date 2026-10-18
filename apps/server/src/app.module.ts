import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClockModule } from './common/clock/clock.js';
import { rateLimitOptions } from './common/http/rate-limit.js';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { ApiDocsModule } from './api-docs/api-docs.module.js';
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
import { DeliveryModule } from './modules/delivery/delivery.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { GovernanceModule } from './modules/governance/governance.module.js';
import { KpisModule } from './modules/kpis/kpis.module.js';
import { ReportingModule } from './modules/reporting/reporting.module.js';
import { StrategyModule } from './modules/strategy/strategy.module.js';

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    DatabaseModule,
    MailModule,
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => rateLimitOptions(env),
    }),
    HealthModule,
    ApiDocsModule,
    AuthModule,
    InvitationsModule,
    StrategyModule,
    KpisModule,
    DeliveryModule,
    ReportingModule,
    GovernanceModule,
    DashboardModule,
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
