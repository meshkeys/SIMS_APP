import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import {
  assertValidKey,
  ObjectNotFoundError,
  type ObjectStorage,
} from './object-storage.js';

/**
 * Any S3-compatible service (AWS S3, Cloudflare R2, Backblaze B2,
 * DigitalOcean Spaces…). The bucket stays private: files are only served
 * through the API, after its permission checks.
 */
export class S3Storage implements ObjectStorage {
  constructor(
    private readonly client: Pick<S3Client, 'send'>,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertValidKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
  }

  async get(key: string): Promise<Readable> {
    assertValidKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) throw new ObjectNotFoundError(key);
      // In Node the SDK returns a readable stream.
      return result.Body as Readable;
    } catch (error) {
      if (isNotFound(error)) throw new ObjectNotFoundError(key);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

function isNotFound(error: unknown): boolean {
  if (error instanceof ObjectNotFoundError) return true;
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NoSuchKey' ||
    e?.name === 'NotFound' ||
    e?.$metadata?.httpStatusCode === 404
  );
}
