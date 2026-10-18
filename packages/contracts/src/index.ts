/**
 * The SIMS API contract: every request and response shape as a zod schema,
 * with its TypeScript type. The server validates requests with these schemas
 * and its responses must match them; the web app uses the same schemas for
 * forms and the same types for data.
 */
export * from './enums.js';
export * from './common.js';
export * from './roles.js';
export * from './auth.js';
export * from './invitations.js';
export * from './strategy.js';
export * from './kpis.js';
export * from './delivery.js';
export * from './reporting.js';
export * from './governance.js';
export * from './dashboard.js';
export * from './routes.js';
export * from './openapi.js';
