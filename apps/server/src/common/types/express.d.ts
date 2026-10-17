import type { AuthContext } from '../../modules/auth/auth-context.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the request-id middleware for every request. */
    requestId?: string;
    /** Set by the auth guard once the access token is verified. */
    auth?: AuthContext;
  }
}
