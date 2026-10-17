import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../infrastructure/database/index.js';
import { HealthController } from './health.controller.js';

const controllerWith = (ping: () => Promise<void>) =>
  new HealthController({ ping } as unknown as PrismaService);

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    await expect(controllerWith(async () => {}).check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    const controller = controllerWith(async () => {
      throw new Error('connection refused');
    });

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
