import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { TenantContext } from '../../infrastructure/database/index.js';

/**
 * Runs each authenticated request inside the caller's tenant context, so
 * every database call made while handling it is scoped to their
 * organisation by row-level security — without passing ids around.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.auth;
    if (!auth) return next.handle();

    return new Observable((subscriber) =>
      TenantContext.run(
        {
          organisationId: auth.organisationId,
          membershipId: auth.membershipId,
          requestId: request.requestId,
        },
        () => next.handle().subscribe(subscriber),
      ),
    );
  }
}
