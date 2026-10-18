import { Global, Injectable, Module } from '@nestjs/common';

/**
 * The single source of "now" for business logic. Planned progress, overdue
 * milestones and overdue updates all depend on the date, so code asks the
 * clock instead of calling `new Date()` — and tests can pin time.
 *
 *   constructor(@Inject(CLOCK) private readonly clock: Clock) {}
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** A clock tests can set. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(at: Date): void {
    this.current = new Date(at);
  }
}

@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
