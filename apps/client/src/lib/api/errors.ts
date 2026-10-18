import type { Problem } from '@sims/contracts';

/** An error answer from the API (RFC 9457 Problem Details), or a network failure. */
export class ApiError extends Error {
  readonly status: number;
  /** Stable code, e.g. "INVALID_CREDENTIALS"; "NETWORK_ERROR" when offline. */
  readonly code: string;
  readonly problem: Problem | null;
  /** Seconds to wait before retrying (429). */
  readonly retryAfter: number | null;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    problem?: Problem | null;
    retryAfter?: number | null;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.problem = options.problem ?? null;
    this.retryAfter = options.retryAfter ?? null;
  }

  /** Field errors keyed by dotted path ("lines.0.claimedCompletion"). */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      (this.problem?.errors ?? []).map((e) => [e.path, e.message]),
    );
  }

  static network(cause: unknown): ApiError {
    const error = new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message:
        'Could not reach the server. Check your connection and try again.',
    });
    error.cause = cause;
    return error;
  }
}

/** A message fit to show a person, whatever went wrong. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return error.retryAfter
        ? `Too many attempts. Try again in ${error.retryAfter} seconds.`
        : 'Too many attempts. Try again shortly.';
    }
    if (error.status >= 500) {
      return 'Something went wrong on our side. Please try again.';
    }
    return error.problem?.detail ?? error.message;
  }
  return 'Something went wrong. Please try again.';
}
