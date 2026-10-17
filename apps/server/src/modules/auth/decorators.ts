import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../../generated/prisma/enums.js';
import type { AuthContext } from './auth-context.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

/**
 * Every route requires a signed-in user unless marked @Public().
 * (Secure by default: forgetting a decorator never exposes data.)
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Allows the route if the caller holds ANY of the listed roles. */
export const Roles = (...roles: [Role, ...Role[]]) =>
  SetMetadata(ROLES_KEY, roles);

/** The verified caller. Only valid on non-public routes. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const auth = ctx.switchToHttp().getRequest<Request>().auth;
    if (!auth) {
      throw new Error('@CurrentAuth() used on a route without authentication');
    }
    return auth;
  },
);
