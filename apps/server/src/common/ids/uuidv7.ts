import { randomBytes } from 'node:crypto';

let lastMs = 0;
let sequence = 0;

/**
 * Time-ordered UUIDv7 (RFC 9562). Used when an id is needed before insert,
 * e.g. to set the tenant context for a brand-new organisation. A per-process
 * counter keeps ids strictly increasing within the same millisecond.
 */
export function uuidv7(): string {
  const now = Date.now();
  sequence = now === lastMs ? sequence + 1 : 0;
  lastMs = now;
  const bytes = randomBytes(16);
  const ts = BigInt(now);
  for (let i = 0; i < 6; i++) {
    bytes[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
  }
  bytes[6] = 0x70 | ((sequence >> 8) & 0x0f);
  bytes[7] = sequence & 0xff;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
