import { S3Client } from '@aws-sdk/client-s3';
import { Global, Module } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { LocalDiskStorage } from './local-disk-storage.js';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.js';
import { S3Storage } from './s3-storage.js';

/** File storage, chosen by STORAGE_DRIVER (see .env.example). */
export function createStorage(env: Env): ObjectStorage {
  if (env.STORAGE_DRIVER === 'local')
    return new LocalDiskStorage(env.STORAGE_LOCAL_DIR);
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
  return new S3Storage(client, env.S3_BUCKET!);
}

@Global()
@Module({
  providers: [
    { provide: OBJECT_STORAGE, inject: [ENV], useFactory: createStorage },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
