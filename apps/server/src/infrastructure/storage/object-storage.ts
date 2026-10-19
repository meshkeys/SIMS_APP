import type { Readable } from 'node:stream';

/** Injection token: `@Inject(OBJECT_STORAGE) storage: ObjectStorage`. */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/**
 * Where file bytes live (evidence, generated packs). Rows in the database
 * hold the metadata and the key; the bytes are only reachable through the
 * API, which checks permissions first. Keys are built by the server, never
 * taken from a request:
 *
 *   <organisationId>/<entityType>/<entityId>/<documentId>
 */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Throws {@link ObjectNotFoundError} when nothing is stored under the key. */
  get(key: string): Promise<Readable>;
  /** Removing a key that does not exist is not an error. */
  delete(key: string): Promise<void>;
}

export class ObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`No object stored under ${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

/** Only server-built keys: UUID-ish path segments, no "..", no leading slash. */
const KEY = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)*$/;

export function assertValidKey(key: string): void {
  if (
    !KEY.test(key) ||
    key.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

/** The key for a stored document. */
export const documentKey = (
  organisationId: string,
  entityType: string,
  entityId: string,
  documentId: string,
) => `${organisationId}/${entityType}/${entityId}/${documentId}`;
