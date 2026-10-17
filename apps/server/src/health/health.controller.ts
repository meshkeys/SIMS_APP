import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../infrastructure/database/index.js';
import { Public } from '../modules/auth/decorators.js';

export interface HealthReport {
  status: 'ok';
  checks: { database: 'up' };
}

/**
 * Liveness/readiness probe for load balancers and container orchestrators.
 * Returns 503 (not 500) when a dependency is down so the instance is taken
 * out of rotation instead of being restarted in a loop.
 */
@Public()
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthReport> {
    try {
      await this.prisma.ping();
    } catch (error) {
      this.logger.error('Database health check failed', error as Error);
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database: 'down' },
      });
    }
    return { status: 'ok', checks: { database: 'up' } };
  }
}
