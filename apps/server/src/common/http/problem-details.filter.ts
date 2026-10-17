import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';

/** One field-level validation problem. */
export interface FieldError {
  path: string;
  message: string;
  code: string;
}

/**
 * Every error response from the API (RFC 9457 "Problem Details"):
 *
 *   HTTP/1.1 409 Conflict
 *   Content-Type: application/problem+json
 *   { "type": "about:blank", "title": "Conflict", "status": 409,
 *     "code": "EMAIL_TAKEN", "detail": "An account with this email…",
 *     "instance": "/api/v1/auth/signup", "requestId": "…" }
 *
 * `code` is stable and machine-readable — clients branch on it, never on text.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: FieldError[];
  instance: string;
  requestId?: string;
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const problem = this.toProblem(exception, request);
    if (problem.status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} failed [${problem.requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (problem.status === HttpStatus.TOO_MANY_REQUESTS) {
      this.ensureRetryAfter(response);
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }

  /**
   * Named rate limiters set "Retry-After-<name>"; clients and proxies expect
   * the standard "Retry-After", so expose the longest wait under that name too.
   */
  private ensureRetryAfter(response: Response): void {
    if (response.getHeader('retry-after') !== undefined) return;
    const waits = response
      .getHeaderNames()
      .filter((name) => name.startsWith('retry-after-'))
      .map((name) => Number(response.getHeader(name)))
      .filter((seconds) => Number.isFinite(seconds));
    if (waits.length)
      response.setHeader('Retry-After', String(Math.max(...waits)));
  }

  private toProblem(exception: unknown, request: Request): ProblemDetails {
    const base = {
      type: 'about:blank',
      instance: request.originalUrl,
      requestId: request.requestId,
    };

    if (!(exception instanceof HttpException)) {
      // Never leak internals (SQL, stack traces) to clients.
      return {
        ...base,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        title: STATUS_CODES[500]!,
        code: 'INTERNAL_ERROR',
        detail:
          'Something went wrong on our side. Quote the request id if you contact support.',
      };
    }

    const status = exception.getStatus();
    const body = exception.getResponse();
    const fields =
      typeof body === 'object' && body !== null
        ? (body as { code?: unknown; message?: unknown; errors?: unknown })
        : { message: body };

    const message = Array.isArray(fields.message)
      ? fields.message.join('; ')
      : typeof fields.message === 'string'
        ? fields.message
        : undefined;

    return {
      ...base,
      status,
      title: STATUS_CODES[status] ?? 'Error',
      code:
        typeof fields.code === 'string'
          ? fields.code
          : (DEFAULT_CODES[status] ??
            (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR')),
      detail: message,
      errors: Array.isArray(fields.errors)
        ? (fields.errors as FieldError[])
        : undefined,
    };
  }
}
