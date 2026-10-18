import SwaggerParser from '@apidevtools/swagger-parser';
import { RequestMethod, type Type } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { ModulesContainer } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  API_ROUTES,
  type ApiRoute,
  buildOpenApiDocument,
} from '@sims/contracts';
import { lastValueFrom, of } from 'rxjs';
import request from 'supertest';
import { ApiDocsController } from '../../src/api-docs/api-docs.controller.js';
import { STRICT_RATE_LIMIT } from '../../src/common/http/rate-limit.js';
import { ZodValidationPipe } from '../../src/common/validation/zod-validation.pipe.js';
import { ENV } from '../../src/config/config.module.js';
import type { Env } from '../../src/config/env.js';
import { HealthController } from '../../src/health/health.controller.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../../src/modules/auth/decorators.js';
import { createTestApp } from '../setup/create-app.js';
import {
  ContractCheckInterceptor,
  contractViolations,
} from '../setup/contract-check.js';

/** Infrastructure routes outside the versioned API. */
const NOT_API = new Set<Type>([HealthController, ApiDocsController]);

interface ServerRoute {
  key: string;
  public: boolean;
  roles: string[];
  status: number;
  strictRateLimit: boolean;
  body: unknown;
  query: unknown;
}

const join = (...parts: string[]) =>
  '/' +
  parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/');

/** Every route the running server exposes, read from Nest's own metadata. */
function serverRoutes(app: NestExpressApplication): ServerRoute[] {
  const routes: ServerRoute[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as Type | null;
      if (!controller || NOT_API.has(controller)) continue;
      const base = (Reflect.getMetadata(PATH_METADATA, controller) ??
        '') as string;
      const classPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
      const args = (name: string) =>
        (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, name) ??
          {}) as Record<string, { pipes?: unknown[] }>;
      const schemaOf = (name: string, type: RouteParamtypes) => {
        const entry = Object.entries(args(name)).find(([key]) =>
          key.startsWith(`${type}:`),
        )?.[1];
        const pipe = entry?.pipes?.find((p) => p instanceof ZodValidationPipe);
        return pipe
          ? (pipe as unknown as { schema: unknown }).schema
          : undefined;
      };

      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name] as object;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as
          string | undefined;
        if (name === 'constructor' || path === undefined) continue;
        const method =
          RequestMethod[
            Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod
          ].toLowerCase();
        routes.push({
          key: `${method} ${join(base, path).replace(/:(\w+)/g, '{$1}')}`,
          public:
            classPublic || Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true,
          roles: [
            ...((Reflect.getMetadata(ROLES_KEY, handler) ?? []) as string[]),
          ].sort((a, b) => a.localeCompare(b)),
          status:
            (Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number) ??
            (method === 'post' ? 201 : 200),
          strictRateLimit:
            Reflect.getMetadata(STRICT_RATE_LIMIT, handler) === true,
          body: schemaOf(name, RouteParamtypes.BODY),
          query: schemaOf(name, RouteParamtypes.QUERY),
        });
      }
    }
  }
  return routes;
}

describe('API contract (e2e)', () => {
  let app: NestExpressApplication;
  const contract = Object.entries(API_ROUTES) as [string, ApiRoute][];

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('describes every server route, and only those', () => {
    const server = serverRoutes(app)
      .map((r) => r.key)
      .sort();
    const documented = contract
      .map(([, route]) => `${route.method} ${route.path}`)
      .sort();
    expect(server).toEqual(documented);
  });

  it('matches each route’s access, status, rate limit and request schemas', () => {
    const byKey = new Map(serverRoutes(app).map((r) => [r.key, r]));
    for (const [id, route] of contract) {
      const actual = byKey.get(`${route.method} ${route.path}`)!;
      const expected = {
        public: route.access === 'public',
        roles: Array.isArray(route.access)
          ? [...route.access].sort((a, b) => a.localeCompare(b))
          : [],
        status: route.status,
        strictRateLimit: route.strictRateLimit ?? false,
      };
      expect(
        {
          public: actual.public,
          roles: actual.roles,
          status: actual.status,
          strictRateLimit: actual.strictRateLimit,
        },
        id,
      ).toEqual(expected);
      // The very schema objects the controller validates with.
      expect(actual.body === route.body, `${id}: body schema`).toBe(true);
      expect(actual.query === route.query, `${id}: query schema`).toBe(true);
    }
  });

  it('generates a valid OpenAPI 3.1 document', async () => {
    const document = buildOpenApiDocument({
      version: 'v1',
      serverUrl: '/api/v1',
    });
    await expect(
      SwaggerParser.validate(structuredClone(document) as never),
    ).resolves.toBeTruthy();
    expect(Object.keys(document.components.schemas)).toContain(
      'InitiativeDetail',
    );
  });

  it('serves the document and the reference page', async () => {
    const json = await request(app.getHttpServer()).get('/api/openapi.json');
    expect(json.status).toBe(200);
    expect(json.body.openapi).toBe('3.1.0');
    expect(Object.keys(json.body.paths)).toContain('/dashboard');

    const page = await request(app.getHttpServer()).get('/api/docs');
    expect(page.status).toBe(200);
    expect(page.text).toContain("createApiReference('#app'");
    // Only this page may load the pinned script, and only with the nonce.
    const nonce = /nonce="([^"]+)"/.exec(page.text)![1];
    expect(page.headers['content-security-policy']).toContain(
      `script-src 'nonce-${nonce}' https://cdn.jsdelivr.net`,
    );
    expect(page.text).toContain('integrity="sha384-');
  });

  it('hides the reference when API_DOCS is off', async () => {
    const env = app.get<Env>(ENV);
    const closed = await createTestApp({
      overrides: [{ provide: ENV, useValue: { ...env, API_DOCS: false } }],
    });
    try {
      const json = await request(closed.getHttpServer()).get(
        '/api/openapi.json',
      );
      expect(json.status).toBe(404);
      const page = await request(closed.getHttpServer()).get('/api/docs');
      expect(page.status).toBe(404);
    } finally {
      await closed.close();
    }
  });

  it('flags a response that breaks its contract', async () => {
    const interceptor = new ContractCheckInterceptor();
    const context = {
      getClass: () => class Probe {},
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          route: { path: '/api/v1/dashboard' },
        }),
      }),
    };
    await lastValueFrom(
      interceptor.intercept(context as never, {
        handle: () => of({ plan: 'not a plan' }),
      }),
    );
    expect(contractViolations.splice(0)).toEqual([
      expect.stringMatching(/^getDashboard: /),
    ]);
  });
});
