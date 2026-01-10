import type { PushSubscriptionData } from '@claude-notifier/shared';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  tag?: string;
  requireInteraction?: boolean;
}

/**
 * Send a Web Push notification
 * Uses the Web Push protocol with VAPID authentication
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload,
  vapidKeys: VapidKeys
): Promise<{ success: boolean; error?: string }> {
  try {
    const payloadString = JSON.stringify(payload);
    const payloadBytes = new TextEncoder().encode(payloadString);

    // Generate VAPID JWT
    const jwt = await generateVapidJwt(
      new URL(subscription.endpoint).origin,
      vapidKeys.subject,
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );

    // Encrypt payload using Web Push encryption
    const encrypted = await encryptPayload(
      payloadBytes,
      subscription.keys.p256dh,
      subscription.keys.auth
    );

    // Build request
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400',
        'Authorization': `vapid t=${jwt}, k=${vapidKeys.publicKey}`,
      },
      body: encrypted,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Push failed:', response.status, text);
      return { success: false, error: `Push failed: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    console.error('Push error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Generate VAPID JWT for Web Push authentication
 */
async function generateVapidJwt(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    typ: 'JWT',
    alg: 'ES256',
  };

  const payload = {
    aud: audience,
    exp: now + 86400, // 24 hours
    sub: subject,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key and sign
  const privateKeyBytes = base64urlDecode(privateKey);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = base64urlEncode(new Uint8Array(signature));

  return `${unsignedToken}.${signatureB64}`;
}

/**
 * Encrypt payload using Web Push encryption (aes128gcm)
 */
async function encryptPayload(
  payload: Uint8Array,
  p256dhKey: string,
  authSecret: string
): Promise<Uint8Array> {
  // Import subscriber's public key
  const subscriberPublicKey = base64urlDecode(p256dhKey);
  const authSecretBytes = base64urlDecode(authSecret);

  // Generate ephemeral key pair
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  // Import subscriber public key
  const subscriberKey = await crypto.subtle.importKey(
    'raw',
    subscriberPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberKey },
    ephemeralKeyPair.privateKey,
    256
  );

  // Export ephemeral public key
  const ephemeralPublicKey = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey);

  // Derive content encryption key and nonce using HKDF
  const { contentEncryptionKey, nonce } = await deriveEncryptionKeys(
    new Uint8Array(sharedSecret),
    authSecretBytes,
    new Uint8Array(ephemeralPublicKey),
    subscriberPublicKey
  );

  // Encrypt with AES-GCM
  const iv = nonce;
  const key = await crypto.subtle.importKey(
    'raw',
    contentEncryptionKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // Add padding (delimiter byte + padding)
  const paddedPayload = new Uint8Array(payload.length + 1);
  paddedPayload.set(payload);
  paddedPayload[payload.length] = 2; // Delimiter

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    paddedPayload
  );

  // Build aes128gcm encoded message
  // salt (16) + rs (4) + idlen (1) + keyid (65) + ciphertext
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);

  const result = new Uint8Array(
    16 + 4 + 1 + 65 + new Uint8Array(ciphertext).length
  );
  let offset = 0;
  result.set(salt, offset);
  offset += 16;
  result.set(rs, offset);
  offset += 4;
  result[offset] = 65;
  offset += 1;
  result.set(new Uint8Array(ephemeralPublicKey), offset);
  offset += 65;
  result.set(new Uint8Array(ciphertext), offset);

  return result;
}

async function deriveEncryptionKeys(
  sharedSecret: Uint8Array,
  authSecret: Uint8Array,
  senderPublicKey: Uint8Array,
  receiverPublicKey: Uint8Array
): Promise<{ contentEncryptionKey: Uint8Array; nonce: Uint8Array }> {
  // IKM = HKDF(authSecret, sharedSecret, "WebPush: info" || 0x00 || receiverPublicKey || senderPublicKey, 32)
  const authInfo = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info\x00'),
    ...receiverPublicKey,
    ...senderPublicKey,
  ]);

  const prk = await hkdfExtract(authSecret, sharedSecret);
  const ikm = await hkdfExpand(prk, authInfo, 32);

  // Generate salt for CEK derivation
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\x00');
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\x00');

  const prk2 = await hkdfExtract(salt, ikm);
  const contentEncryptionKey = await hkdfExpand(prk2, cekInfo, 16);
  const nonce = await hkdfExpand(prk2, nonceInfo, 12);

  return { contentEncryptionKey, nonce };
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    salt,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const prk = await crypto.subtle.sign('HMAC', key, ikm);
  return new Uint8Array(prk);
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    prk,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const result = new Uint8Array(length);
  let offset = 0;
  let counter = 1;
  let prev = new Uint8Array(0);

  while (offset < length) {
    const input = new Uint8Array([...prev, ...info, counter]);
    const block = new Uint8Array(await crypto.subtle.sign('HMAC', key, input));
    result.set(block.slice(0, Math.min(32, length - offset)), offset);
    offset += 32;
    prev = block;
    counter++;
  }

  return result.slice(0, length);
}

function base64urlEncode(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
