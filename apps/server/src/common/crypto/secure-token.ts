import { createHash, randomBytes } from 'node:crypto';

/**
 * A random, URL-safe secret (256 bits). Given to its owner exactly once —
 * in a cookie, an email link — and never stored.
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What the database stores instead of the token. SHA-256 is right here
 * (unlike for passwords): the token is already high-entropy, so it cannot be
 * guessed, and lookups by hash must be fast and indexable.
 */
export function hashSecureToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
