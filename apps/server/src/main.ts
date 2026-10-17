import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Close DB pools cleanly on SIGTERM so rolling deploys drop no requests.
  app.enableShutdownHooks();

  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
}
await bootstrap();
