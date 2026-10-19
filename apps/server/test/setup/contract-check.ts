import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  type Type,
} from '@nestjs/common';
import { API_ROUTES, type ApiRoute } from '@sims/contracts';
import type { Request } from 'express';
import { tap } from 'rxjs';

/**
 * Every successful API response in the e2e suites is checked against its
 * contract schema; mismatches are collected here and fail the test file
 * (see contract-afterall.ts). This keeps `@sims/contracts` honest: the web
 * app can trust the types because real responses are proven to match them.
 */
export const contractViolations: string[] = [];

/** "get /api/v1/initiatives/:id" → its contract route. */
const ROUTES = new Map<string, [string, ApiRoute]>(
  (Object.entries(API_ROUTES) as [string, ApiRoute][]).map(([id, route]) => [
    `${route.method} /api/v1${route.path.replace(/\{(\w+)\}/g, ':$1')}`,
    [id, route],
  ]),
);

@Injectable()
export class ContractCheckInterceptor implements NestInterceptor {
  /** @param testControllers controllers a test adds itself (not part of the API) */
  constructor(private readonly testControllers: readonly Type[] = []) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (this.testControllers.includes(context.getClass())) return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    const key = `${request.method.toLowerCase()} ${(request.route as { path?: string } | undefined)?.path}`;
    return next.handle().pipe(
      tap((body: unknown) => {
        if (!key.includes(' /api/v1/')) return; // /health, /api/docs…
        const match = ROUTES.get(key);
        if (!match) {
          contractViolations.push(`${key}: no route in @sims/contracts`);
          return;
        }
        const [operationId, route] = match;
        if (route.produces) return; // a file download, checked by its own tests
        if (route.response === null) {
          if (body !== undefined)
            contractViolations.push(`${operationId}: expected no body`);
          return;
        }
        // Exactly what the client receives.
        const wire: unknown =
          body === undefined ? undefined : JSON.parse(JSON.stringify(body));
        const result = route.response.safeParse(wire);
        if (!result.success) {
          const issues = result.error.issues
            .slice(0, 5)
            .map(
              (issue) =>
                `${issue.path.join('.') || '(root)'}: ${issue.message}`,
            );
          contractViolations.push(`${operationId}: ${issues.join('; ')}`);
        }
      }),
    );
  }
}
