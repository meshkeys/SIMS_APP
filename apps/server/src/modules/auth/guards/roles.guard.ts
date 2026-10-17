import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '../../../generated/prisma/enums.js';
import { ROLES_KEY } from '../decorators.js';

/**
 * Global guard: enforces @Roles(...). Runs after AccessTokenGuard.
 * Role checks are coarse ("may this kind of user call this endpoint?");
 * record-level rules (owner, sponsor, sensitive initiatives) live in services.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const auth = context.switchToHttp().getRequest<Request>().auth;
    if (auth && required.some((role) => auth.roles.includes(role))) return true;

    throw new ForbiddenException({
      code: 'INSUFFICIENT_ROLE',
      message: 'You do not have permission to do this.',
    });
  }
}
