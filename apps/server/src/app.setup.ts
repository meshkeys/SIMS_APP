import { VersioningType } from '@nestjs/common';
import { friendlyErrors } from '@sims/contracts';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import helmet from 'helmet';
import { ProblemDetailsFilter } from './common/http/problem-details.filter.js';
import { REQUEST_ID_HEADER, requestId } from './common/http/request-id.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';

/**
 * HTTP-level configuration shared by main.ts and the e2e tests, so tests
 * exercise exactly what runs in production.
 *
 * Routes: /api/v1/<resource>; /health stays unversioned for load balancers.
 */
export function configureApp(
  app: NestExpressApplication,
): NestExpressApplication {
  const env = app.get<Env>(ENV);
  // Field errors in plain English ("Required"), the same words the web app shows.
  z.config({ customError: friendlyErrors });

  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    exposedHeaders: [REQUEST_ID_HEADER],
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new ProblemDetailsFilter());

  // Close DB pools cleanly on SIGTERM so rolling deploys drop no requests.
  app.enableShutdownHooks();
  return app;
}
