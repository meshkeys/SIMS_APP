import { Logger } from '@nestjs/common';
import { TenantContext } from '../database/index.js';

/** Every background job, with its payload. Add new jobs here. */
export interface JobPayloads {
  'report-pack.generate': { packId: string };
}
export type JobName = keyof JobPayloads;

/** Who a job acts for: it runs inside this tenant context, so row-level security applies. */
export interface JobTenant {
  organisationId: string;
  membershipId?: string;
}

export interface JobEnvelope<N extends JobName = JobName> {
  tenant: JobTenant;
  data: JobPayloads[N];
}

export type JobHandler<N extends JobName> = (
  data: JobPayloads[N],
) => Promise<void>;

/** Injection token: `@Inject(JOB_QUEUE) jobs: JobQueue`. */
export const JOB_QUEUE = Symbol('JOB_QUEUE');

/**
 * Background work (generating board packs; later reminders, clean-up and
 * escalation sweeps). Enqueue only after the transaction that created the
 * work has committed, so the job can see it.
 */
export interface JobQueue {
  /** Runs the job for the current tenant. */
  enqueue<N extends JobName>(name: N, data: JobPayloads[N]): Promise<void>;
  /** Called once per job name by the module that handles it. */
  handle<N extends JobName>(name: N, handler: JobHandler<N>): void;
}

/** Shared by both drivers: look up the handler and run it as the job's tenant. */
export class JobHandlers {
  private readonly logger = new Logger('Jobs');
  private readonly handlers = new Map<JobName, JobHandler<JobName>>();

  register<N extends JobName>(name: N, handler: JobHandler<N>): void {
    this.handlers.set(name, handler as unknown as JobHandler<JobName>);
  }

  async run(name: string, envelope: JobEnvelope): Promise<void> {
    const handler = this.handlers.get(name as JobName);
    if (!handler) throw new Error(`No handler for job ${name}`);
    const started = Date.now();
    await TenantContext.run(envelope.tenant, () => handler(envelope.data));
    this.logger.log(`${name} done in ${Date.now() - started} ms`);
  }
}

export function currentTenant(): JobTenant {
  const { organisationId, membershipId } = TenantContext.require();
  return { organisationId, membershipId };
}
