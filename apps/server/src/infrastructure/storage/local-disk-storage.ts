import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import {
  assertValidKey,
  ObjectNotFoundError,
  type ObjectStorage,
} from './object-storage.js';

/**
 * Files in a folder: for development, tests and single-server installs
 * (point it at a backed-up volume). Writes go to a temporary file first and
 * are renamed into place, so a crash never leaves half a file under a key.
 */
export class LocalDiskStorage implements ObjectStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, body: Buffer, _contentType?: string): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, body);
    await rename(temporary, path);
  }

  async get(key: string): Promise<Readable> {
    const path = this.pathOf(key);
    try {
      await stat(path);
    } catch {
      throw new ObjectNotFoundError(key);
    }
    return createReadStream(path);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  private pathOf(key: string): string {
    assertValidKey(key);
    const path = resolve(this.root, key);
    // Belt and braces: never leave the storage folder.
    if (!path.startsWith(this.root + sep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return path;
  }
}
