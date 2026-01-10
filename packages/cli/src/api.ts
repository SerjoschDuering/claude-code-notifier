import { Config } from './config.js';
import { generateNonce, hashBody, buildCanonicalString, createSignature } from './crypto.js';
import type { RequestPayload, ApiResponse, ApprovalRequest } from '@claude-notifier/shared';

export async function initializePairing(serverUrl: string): Promise<{
  success: boolean;
  data?: { pairingId: string; pairingSecret: string };
  error?: string;
}> {
  const response = await fetch(`${serverUrl}/api/pair/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  return response.json();
}

export async function createApprovalRequest(
  config: Config,
  requestId: string,
  payload: RequestPayload
): Promise<ApiResponse<{ requestId: string }>> {
  const path = '/api/request';
  const ts = Math.floor(Date.now() / 1000);
  const nonce = generateNonce();

  const bodyData = {
    pairingId: config.pairingId,
    requestId,
    payload,
    ts,
    nonce,
    signature: '',
  };

  const bodyHash = hashBody(JSON.stringify(bodyData));
  const canonicalString = buildCanonicalString('POST', path, bodyHash, ts, nonce);
  const signature = createSignature(config.pairingSecret, canonicalString);

  bodyData.signature = signature;

  const response = await fetch(`${config.serverUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData),
  });

  return response.json();
}

export async function pollDecision(
  config: Config,
  requestId: string
): Promise<ApiResponse<{ status: string }>> {
  const path = `/api/decision/${requestId}`;
  const ts = Math.floor(Date.now() / 1000);
  const nonce = generateNonce();

  const bodyHash = hashBody('');
  const canonicalString = buildCanonicalString('GET', path, bodyHash, ts, nonce);
  const signature = createSignature(config.pairingSecret, canonicalString);

  const url = new URL(`${config.serverUrl}${path}`);
  url.searchParams.set('pairingId', config.pairingId);
  url.searchParams.set('ts', ts.toString());
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('signature', signature);

  const response = await fetch(url.toString());
  return response.json();
}
