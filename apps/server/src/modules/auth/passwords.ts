import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id with the OWASP-recommended baseline (19 MiB, 2 iterations,
 * 1 lane). Parameters are stored inside each hash, so they can be raised
 * later without breaking existing passwords.
 */
// The library's default algorithm is Argon2id.
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // A malformed stored hash must never authenticate anyone.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Spends the same time as a real check when the account does not exist,
 * so response timing does not reveal which emails are registered.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('timing-equaliser-not-a-real-password');
  await verifyPassword(await dummyHash, password);
}
