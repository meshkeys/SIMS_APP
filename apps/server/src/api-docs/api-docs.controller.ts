import { randomBytes } from 'node:crypto';
import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { buildOpenApiDocument } from '@sims/contracts';
import type { Response } from 'express';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { Public } from '../modules/auth/decorators.js';

/** Scalar's API reference UI, pinned by version and integrity hash. */
const SCALAR = {
  src: 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.75.0/dist/browser/standalone.js',
  integrity:
    'sha384-xgelKlDcc+BYp0O+ZYzFesLnWCgGpEbXVVZWNQT6WyZYygN01tbEMygnjPXb5OPI',
};

/**
 * The API reference: `/api/openapi.json` (OpenAPI 3.1, generated from
 * `@sims/contracts`) and `/api/docs` (an interactive page). Off in
 * production unless `API_DOCS=true`.
 */
@Public()
@Controller({ version: VERSION_NEUTRAL })
export class ApiDocsController {
  private document?: ReturnType<typeof buildOpenApiDocument>;

  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get('openapi.json')
  openApi() {
    this.assertEnabled();
    // Built once: the contract cannot change while the process runs.
    this.document ??= buildOpenApiDocument({
      version: 'v1',
      serverUrl: '/api/v1',
    });
    return this.document;
  }

  @Get('docs')
  @Header('Cache-Control', 'no-store')
  docs(@Res() res: Response): void {
    this.assertEnabled();
    const nonce = randomBytes(16).toString('base64');
    // This page alone may load the pinned script from the CDN.
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src 'nonce-${nonce}' ${new URL(SCALAR.src).origin}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SIMS API reference</title>
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${SCALAR.src}" integrity="${SCALAR.integrity}" crossorigin="anonymous"></script>
    <script nonce="${nonce}">
      Scalar.createApiReference('#app', {
        url: '/api/openapi.json',
        withDefaultFonts: false,
        hideClientButton: true,
        defaultOpenAllTags: false,
      });
    </script>
  </body>
</html>`);
  }

  private assertEnabled(): void {
    if (!this.env.API_DOCS) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'The API reference is not enabled on this server.',
      });
    }
  }
}
