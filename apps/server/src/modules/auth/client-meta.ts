import type { Request } from 'express';
import type { ClientMeta } from './tokens/refresh-token.service.js';

/** Device details recorded with sessions and audit events. */
export const clientMeta = (req: Request): ClientMeta => ({
  userAgent: req.header('user-agent'),
  ipAddress: req.ip,
});
