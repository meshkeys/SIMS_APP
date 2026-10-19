import {
  Global,
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { BullMqJobQueue } from './bullmq-job-queue.js';
import { InlineJobQueue } from './inline-job-queue.js';
import { JOB_QUEUE, type JobQueue } from './job-queue.js';

/** The background job queue, chosen by JOBS_DRIVER (see .env.example). */
export function createJobQueue(env: Env): JobQueue {
  return env.JOBS_DRIVER === 'inline'
    ? new InlineJobQueue()
    : new BullMqJobQueue(env.REDIS_URL, env.JOBS_WORKER);
}

@Global()
@Module({
  providers: [
    { provide: JOB_QUEUE, inject: [ENV], useFactory: createJobQueue },
  ],
  exports: [JOB_QUEUE],
})
export class JobsModule
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(@Inject(JOB_QUEUE) private readonly jobs: JobQueue) {}

  /** Workers start once every module has registered its handlers. */
  onApplicationBootstrap() {
    if (this.jobs instanceof BullMqJobQueue) this.jobs.start();
  }

  async onApplicationShutdown() {
    if (this.jobs instanceof BullMqJobQueue) await this.jobs.stop();
  }
}
