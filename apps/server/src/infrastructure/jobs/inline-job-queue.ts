import { Logger } from '@nestjs/common';
import {
  currentTenant,
  type JobHandler,
  JobHandlers,
  type JobName,
  type JobPayloads,
  type JobQueue,
} from './job-queue.js';

/**
 * Runs each job at once, inside the call that enqueued it (tests and quick
 * local runs). A failing job is logged, never thrown at the caller: the job
 * records its own failure, as it would on the real queue.
 */
export class InlineJobQueue implements JobQueue {
  private readonly logger = new Logger('Jobs');
  private readonly handlers = new JobHandlers();

  handle<N extends JobName>(name: N, handler: JobHandler<N>): void {
    this.handlers.register(name, handler);
  }

  async enqueue<N extends JobName>(
    name: N,
    data: JobPayloads[N],
  ): Promise<void> {
    try {
      await this.handlers.run(name, { tenant: currentTenant(), data });
    } catch (error) {
      this.logger.error(`${name} failed: ${(error as Error).message}`);
    }
  }
}
