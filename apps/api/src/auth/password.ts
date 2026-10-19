import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

let dummyHash: Promise<string> | undefined;

/**
 * Checks the password against the hash. Without a hash (unknown Collaborator or SSO only), checks
 * against a dummy hash so response time does not reveal which e-mails have an account.
 */
export async function verifyPassword(passwordHash: string | null | undefined, password: string) {
  if (!passwordHash) {
    dummyHash ??= hash(randomBytes(16).toString('hex'));
    await verify(await dummyHash, password);
    return false;
  }
  return verify(passwordHash, password).catch(() => false);
}

export function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}
