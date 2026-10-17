import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Response } from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';

/** The real application, configured exactly as in production. */
export async function createTestApp(
  options: { controllers?: Type[] } = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  }).compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestExpressApplication>(),
  );
  await app.init();
  return app;
}

/** "name=value" for a cookie set by a response, ready for a Cookie header. */
export function cookieFrom(
  response: Response,
  name: string,
): string | undefined {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw
    ?.map((cookie) => cookie.split(';')[0])
    .find(
      (pair) => pair.startsWith(`${name}=`) && pair.length > name.length + 1,
    );
}

/** The full Set-Cookie line for a cookie, to inspect its attributes. */
export function setCookieLine(
  response: Response,
  name: string,
): string | undefined {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((cookie) => cookie.startsWith(`${name}=`));
}
