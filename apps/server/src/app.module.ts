import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';
import { DatabaseModule } from './infrastructure/database/index.js';

@Module({
  imports: [ConfigModule, DatabaseModule, HealthModule],
})
export class AppModule {}
