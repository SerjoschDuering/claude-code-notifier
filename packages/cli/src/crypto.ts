import { createHmac, randomBytes } from 'crypto';

export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

export function generateId(): string {
  return randomBytes(16).toString('hex');
}

export function generateSecret(): string {
  return randomBytes(32).toString('base64');
}

export function hashBody(body: string): string {
  const hash = createHmac('sha256', '');
  hash.update(body);
  // Actually use createHash for body hash
  const { createHash } = require('crypto');
  const bodyHash = createHash('sha256').update(body).digest('base64');
  return bodyHash;
}

export function buildCanonicalString(
  method: string,
  path: string,
  bodyHash: string,
  ts: number,
  nonce: string
): string {
  return `${method}\n${path}\n${bodyHash}\n${ts}\n${nonce}`;
}

export function createSignature(secret: string, message: string): string {
  const secretBuffer = Buffer.from(secret, 'base64');
  const hmac = createHmac('sha256', secretBuffer);
  hmac.update(message);
  return hmac.digest('base64');
}
