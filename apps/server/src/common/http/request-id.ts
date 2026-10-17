import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

// Accept an upstream id (load balancer, client) only if it is safe to log.
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Gives every request an id, echoed in the `X-Request-Id` response header,
 * included in error bodies and attached to logs and audit events, so one
 * request can be traced end to end.
 */
export function requestId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  req.requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, req.requestId);
  next();
}
