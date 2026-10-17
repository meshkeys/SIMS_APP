import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../../generated/prisma/enums.js';
import { RolesGuard } from './roles.guard.js';

const contextFor = (roles: Role[] | undefined, callerRoles?: Role[]) => {
  const handler = () => undefined;
  if (roles) Reflect.defineMetadata('auth:roles', roles, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({
        auth: callerRoles ? { roles: callerRoles } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
};

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows routes without a role requirement', () => {
    expect(guard.canActivate(contextFor(undefined, ['TASK_OWNER']))).toBe(true);
  });

  it('allows a caller holding any of the required roles', () => {
    expect(
      guard.canActivate(
        contextFor(['CEO', 'BOARD'], ['INITIATIVE_OWNER', 'BOARD']),
      ),
    ).toBe(true);
  });

  it('forbids a caller holding none of them', () => {
    expect(() =>
      guard.canActivate(contextFor(['STRATEGY_OFFICE'], ['INITIATIVE_OWNER'])),
    ).toThrow(ForbiddenException);
  });

  it('forbids an unauthenticated request on a role-restricted route', () => {
    expect(() => guard.canActivate(contextFor(['BOARD']))).toThrow(
      ForbiddenException,
    );
  });
});
