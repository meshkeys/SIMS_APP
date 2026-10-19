import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { LocalDiskStorage } from './local-disk-storage.js';
import { ObjectNotFoundError } from './object-storage.js';
import { S3Storage } from './s3-storage.js';

const KEY = '0192a1b2-c3d4/Milestone/0192a1b2-c3d5/0192a1b2-c3d6';

describe('LocalDiskStorage', () => {
  let root: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sims-storage-'));
    storage = new LocalDiskStorage(root);
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it('stores, reads back and deletes a file', async () => {
    await storage.put(KEY, Buffer.from('sprint report'), 'application/pdf');
    expect(await text(await storage.get(KEY))).toBe('sprint report');

    await storage.delete(KEY);
    await expect(storage.get(KEY)).rejects.toBeInstanceOf(ObjectNotFoundError);
    // Deleting again is fine.
    await storage.delete(KEY);
  });

  it('refuses keys that could leave the storage folder', async () => {
    for (const key of ['../escape', 'a/../../b', '/absolute', 'a\b', '']) {
      await expect(
        storage.put(key, Buffer.from('x'), 'text/plain'),
      ).rejects.toThrow(/Invalid storage key/);
    }
  });
});

describe('S3Storage', () => {
  it('sends put, get and delete to the bucket', async () => {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    const body = { pipe: () => undefined } as unknown as Readable;
    const client = {
      send: vi.fn(
        async (command: {
          constructor: { name: string };
          input: Record<string, unknown>;
        }) => {
          sent.push({ name: command.constructor.name, input: command.input });
          return command.constructor.name === 'GetObjectCommand'
            ? { Body: body }
            : {};
        },
      ),
    };
    const storage = new S3Storage(client as never, 'sims-files');

    await storage.put(KEY, Buffer.from('abc'), 'application/pdf');
    expect(await storage.get(KEY)).toBe(body);
    await storage.delete(KEY);

    expect(sent.map((s) => s.name)).toEqual([
      'PutObjectCommand',
      'GetObjectCommand',
      'DeleteObjectCommand',
    ]);
    expect(sent[0]!.input).toMatchObject({
      Bucket: 'sims-files',
      Key: KEY,
      ContentType: 'application/pdf',
      ContentLength: 3,
    });
  });

  it('reports a missing object as not found', async () => {
    const client = {
      send: vi.fn(async () => {
        throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      }),
    };
    await expect(
      new S3Storage(client as never, 'sims-files').get(KEY),
    ).rejects.toBeInstanceOf(ObjectNotFoundError);
  });
});
