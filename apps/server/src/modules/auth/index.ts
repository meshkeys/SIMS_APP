export type { AuthContext } from './auth-context.js';
export { AuthModule } from './auth.module.js';
export { CurrentAuth, Public, Roles } from './decorators.js';
export { AccessTokenGuard } from './guards/access-token.guard.js';
export { RolesGuard } from './guards/roles.guard.js';
export { TenantContextInterceptor } from './tenant-context.interceptor.js';
export { AuthDirectory } from './auth-directory.js';
export {
  AuthService,
  type IssuedSession,
  type SessionView,
} from './auth.service.js';
export { emailSchema, newPasswordSchema } from './auth.schemas.js';
export { clientMeta } from './client-meta.js';
export {
  burnPasswordCheck,
  hashPassword,
  verifyPassword,
} from './passwords.js';
export { type SessionResponse, sendSession } from './session-response.js';
