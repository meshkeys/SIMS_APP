import { Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  currentTenant,
  type JobEnvelope,
  type JobHandler,
  JobHandlers,
  type JobName,
  type JobPayloads,
  type JobQueue,
} from './job-queue.js';

const QUEUE = 'sims';

/**
 * A Redis client for BullMQ. In an ES-module app BullMQ needs a ready-made
 * client rather than connection options; `maxRetriesPerRequest: null` lets
 * workers wait for Redis instead of failing while it restarts.
 */
export function redisClient(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
}

/**
 * Jobs through Redis (BullMQ): they survive restarts and are retried with
 * back-off (3 attempts). With JOBS_WORKER on, this server also processes
 * them; API-only instances can leave that to a separate worker process.
 */
export class BullMqJobQueue implements JobQueue {
  private readonly logger = new Logger('Jobs');
  private readonly handlers = new JobHandlers();
  private readonly queue: Queue;
  private worker: Worker | null = null;
  private readonly clients: Redis[] = [];

  constructor(
    private readonly redisUrl: string,
    private readonly runWorker: boolean,
  ) {
    this.queue = new Queue(QUEUE, { connection: this.client() });
  }

  handle<N extends JobName>(name: N, handler: JobHandler<N>): void {
    this.handlers.register(name, handler);
  }

  async enqueue<N extends JobName>(
    name: N,
    data: JobPayloads[N],
  ): Promise<void> {
    const envelope: JobEnvelope<N> = { tenant: currentTenant(), data };
    await this.queue.add(name, envelope, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 7 * 86_400, count: 1_000 },
      removeOnFail: { age: 30 * 86_400 },
    });
  }

  start(): void {
    if (!this.runWorker || this.worker) return;
    this.worker = new Worker(
      QUEUE,
      (job) => this.handlers.run(job.name, job.data as JobEnvelope),
      // Workers block on Redis, so they get a connection of their own.
      { connection: this.client(), concurrency: 2 },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error(
        `${job?.name ?? 'job'} failed (attempt ${job?.attemptsMade ?? '?'}): ${error.message}`,
      ),
    );
    this.worker.on('error', (error) =>
      this.logger.error(`Job worker: ${error.message}`),
    );
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await Promise.all(this.clients.map((c) => c.quit().catch(() => undefined)));
  }

  private client(): Redis {
    const client = redisClient(this.redisUrl);
    this.clients.push(client);
    return client;
  }
}
