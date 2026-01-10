import { MAX_TIMESTAMP_DRIFT_SECONDS } from '@claude-notifier/shared';

/**
 * Verify HMAC-SHA256 signature
 */
export async function verifySignature(
  secret: string,
  message: string,
  signature: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const secretBytes = base64ToArrayBuffer(secret);

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureBytes = base64ToArrayBuffer(signature);
  const messageBytes = encoder.encode(message);

  return crypto.subtle.verify('HMAC', key, signatureBytes, messageBytes);
}

/**
 * Create HMAC-SHA256 signature
 */
export async function createSignature(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const secretBytes = base64ToArrayBuffer(secret);

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const messageBytes = encoder.encode(message);
  const signature = await crypto.subtle.sign('HMAC', key, messageBytes);

  return arrayBufferToBase64(signature);
}

/**
 * Generate a random nonce
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return arrayBufferToBase64(bytes.buffer);
}

/**
 * Generate a random secret (32 bytes)
 */
export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return arrayBufferToBase64(bytes.buffer);
}

/**
 * Generate a random ID
 */
export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate timestamp is within acceptable drift
 */
export function isTimestampValid(ts: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const drift = Math.abs(now - ts);
  return drift <= MAX_TIMESTAMP_DRIFT_SECONDS;
}

/**
 * Build canonical string for signing
 */
export function buildCanonicalString(
  method: string,
  path: string,
  bodyHash: string,
  ts: number,
  nonce: string
): string {
  return `${method}\n${path}\n${bodyHash}\n${ts}\n${nonce}`;
}

/**
 * Hash body content
 */
export async function hashBody(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(body);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64(hashBuffer);
}

// Utility functions
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
