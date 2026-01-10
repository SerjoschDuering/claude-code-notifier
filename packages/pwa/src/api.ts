// API client for communicating with the Worker

// Use relative URL in production, configurable for dev
const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface SignedRequestParams {
  pairingId: string;
  pairingSecret: string;
  ts?: number;
  nonce?: string;
}

async function createSignature(
  secret: string,
  method: string,
  path: string,
  body: string,
  ts: number,
  nonce: string
): Promise<string> {
  const encoder = new TextEncoder();

  // Hash body
  const bodyData = encoder.encode(body);
  const bodyHashBuffer = await crypto.subtle.digest('SHA-256', bodyData);
  const bodyHash = arrayBufferToBase64(bodyHashBuffer);

  // Build canonical string
  const canonicalString = `${method}\n${path}\n${bodyHash}\n${ts}\n${nonce}`;

  // Import secret key
  const secretBytes = base64ToArrayBuffer(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(canonicalString)
  );

  return arrayBufferToBase64(signature);
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return arrayBufferToBase64(bytes.buffer);
}

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

export async function getVapidPublicKey(): Promise<string> {
  const response = await fetch(`${API_BASE}/vapid-public-key`);
  const data = await response.json();
  return data.publicKey;
}

export async function registerPushSubscription(
  params: SignedRequestParams,
  pushSubscription: PushSubscription
): Promise<{ success: boolean; error?: string }> {
  const path = '/api/pair/register-push';
  const ts = Math.floor(Date.now() / 1000);
  const nonce = generateNonce();

  const subscriptionJSON = pushSubscription.toJSON();
  const body = JSON.stringify({
    pairingId: params.pairingId,
    pushSubscription: {
      endpoint: subscriptionJSON.endpoint,
      keys: subscriptionJSON.keys,
    },
    ts,
    nonce,
    signature: '', // Will be replaced
  });

  const signature = await createSignature(
    params.pairingSecret,
    'POST',
    path,
    body,
    ts,
    nonce
  );

  const signedBody = JSON.stringify({
    pairingId: params.pairingId,
    pushSubscription: {
      endpoint: subscriptionJSON.endpoint,
      keys: subscriptionJSON.keys,
    },
    ts,
    nonce,
    signature,
  });

  const response = await fetch(`${API_BASE}/pair/register-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: signedBody,
  });

  return response.json();
}

export async function getRequest(
  params: SignedRequestParams,
  requestId: string
): Promise<{
  success: boolean;
  data?: {
    requestId: string;
    payload: {
      tool: string;
      command?: string;
      args?: string[];
      cwd?: string;
      details?: string;
    };
    status: string;
    createdAt: number;
    expiresAt: number;
  };
  error?: string;
}> {
  const response = await fetch(
    `${API_BASE}/request/${requestId}?pairingId=${params.pairingId}`
  );
  return response.json();
}

export async function getPendingRequests(
  params: SignedRequestParams
): Promise<{
  success: boolean;
  data?: Array<{
    requestId: string;
    payload: {
      tool: string;
      command?: string;
      args?: string[];
      cwd?: string;
      details?: string;
    };
    status: string;
    createdAt: number;
    expiresAt: number;
  }>;
  error?: string;
}> {
  const response = await fetch(
    `${API_BASE}/requests/pending?pairingId=${params.pairingId}`
  );
  return response.json();
}

export async function submitDecision(
  params: SignedRequestParams,
  requestId: string,
  decision: 'allow' | 'deny'
): Promise<{ success: boolean; error?: string }> {
  const path = `/api/decision/${requestId}`;
  const ts = Math.floor(Date.now() / 1000);
  const nonce = generateNonce();

  const bodyData = {
    pairingId: params.pairingId,
    decision,
    ts,
    nonce,
    signature: '',
  };

  const signature = await createSignature(
    params.pairingSecret,
    'POST',
    path,
    JSON.stringify(bodyData),
    ts,
    nonce
  );

  bodyData.signature = signature;

  const response = await fetch(`${API_BASE}/decision/${requestId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData),
  });

  return response.json();
}
