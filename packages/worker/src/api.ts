import type { Env } from './index';
import type {
  RegisterPushRequest,
  CreateApprovalRequest,
  DecisionRequest,
  ApiResponse,
  PushSubscriptionData,
} from '@claude-notifier/shared';
import { MAX_PAYLOAD_SIZE_BYTES } from '@claude-notifier/shared';
import { verifySignature, buildCanonicalString, hashBody, isTimestampValid, generateId, generateSecret } from './crypto';
import { sendPushNotification } from './web-push';

export async function handleApiRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api', '');

  // GET /api/vapid-public-key - return VAPID public key for push subscription
  if (path === '/vapid-public-key' && request.method === 'GET') {
    return jsonResponse({ publicKey: env.VAPID_PUBLIC_KEY });
  }

  // POST /api/pair/init - initialize a new pairing (called by CLI)
  if (path === '/pair/init' && request.method === 'POST') {
    return handlePairInit(request, env);
  }

  // POST /api/pair/register-push - register push subscription
  if (path === '/pair/register-push' && request.method === 'POST') {
    return handleRegisterPush(request, env);
  }

  // POST /api/request - create a new approval request
  if (path === '/request' && request.method === 'POST') {
    return handleCreateRequest(request, env, ctx);
  }

  // GET /api/request/:id - get request details
  if (path.startsWith('/request/') && request.method === 'GET') {
    const requestId = path.replace('/request/', '');
    return handleGetRequest(request, env, requestId);
  }

  // POST /api/decision/:id - submit a decision
  if (path.startsWith('/decision/') && request.method === 'POST') {
    const requestId = path.replace('/decision/', '');
    return handleDecision(request, env, requestId);
  }

  // GET /api/decision/:id - poll for decision (called by CLI)
  if (path.startsWith('/decision/') && request.method === 'GET') {
    const requestId = path.replace('/decision/', '');
    return handlePollDecision(request, env, requestId);
  }

  return jsonResponse({ success: false, error: 'Not found' }, 404);
}

async function handlePairInit(request: Request, env: Env): Promise<Response> {
  const pairingId = generateId();
  const pairingSecret = generateSecret();

  // Store in device registry DO
  const deviceId = env.DEVICE_REGISTRY.idFromName(pairingId);
  const deviceDO = env.DEVICE_REGISTRY.get(deviceId);

  await deviceDO.fetch(new Request('http://internal/register', {
    method: 'POST',
    body: JSON.stringify({ pairingId, pairingSecret }),
  }));

  return jsonResponse({
    success: true,
    data: { pairingId, pairingSecret },
  });
}

async function handleRegisterPush(request: Request, env: Env): Promise<Response> {
  const body = await request.text();

  if (body.length > MAX_PAYLOAD_SIZE_BYTES) {
    return jsonResponse({ success: false, error: 'Payload too large' }, 413);
  }

  const data = JSON.parse(body) as RegisterPushRequest;

  // Validate request
  const validation = await validateSignedRequest(data, body, '/api/pair/register-push', 'POST', env);
  if (!validation.valid) {
    return jsonResponse({ success: false, error: validation.error }, 401);
  }

  // Register push subscription
  const deviceId = env.DEVICE_REGISTRY.idFromName(data.pairingId);
  const deviceDO = env.DEVICE_REGISTRY.get(deviceId);

  const response = await deviceDO.fetch(new Request('http://internal/register-push', {
    method: 'POST',
    body: JSON.stringify({ pushSubscription: data.pushSubscription }),
  }));

  if (!response.ok) {
    const error = await response.json() as { error: string };
    return jsonResponse({ success: false, error: error.error }, response.status);
  }

  return jsonResponse({ success: true });
}

async function handleCreateRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const body = await request.text();

  if (body.length > MAX_PAYLOAD_SIZE_BYTES) {
    return jsonResponse({ success: false, error: 'Payload too large' }, 413);
  }

  const data = JSON.parse(body) as CreateApprovalRequest;

  // Validate request
  const validation = await validateSignedRequest(data, body, '/api/request', 'POST', env);
  if (!validation.valid) {
    return jsonResponse({ success: false, error: validation.error }, 401);
  }

  // Check rate limit
  const deviceId = env.DEVICE_REGISTRY.idFromName(data.pairingId);
  const deviceDO = env.DEVICE_REGISTRY.get(deviceId);

  const rateLimitResp = await deviceDO.fetch(new Request('http://internal/check-rate-limit'));
  const rateLimit = await rateLimitResp.json() as { allowed: boolean };
  if (!rateLimit.allowed) {
    return jsonResponse({ success: false, error: 'Rate limit exceeded' }, 429);
  }

  // Create approval request
  const requestsId = env.APPROVAL_REQUESTS.idFromName(data.pairingId);
  const requestsDO = env.APPROVAL_REQUESTS.get(requestsId);

  const createResp = await requestsDO.fetch(new Request('http://internal/create', {
    method: 'POST',
    body: JSON.stringify({
      requestId: data.requestId,
      pairingId: data.pairingId,
      payload: data.payload,
    }),
  }));

  if (!createResp.ok) {
    const error = await createResp.json() as { error: string };
    return jsonResponse({ success: false, error: error.error }, createResp.status);
  }

  // Increment request count
  await deviceDO.fetch(new Request('http://internal/increment-request', { method: 'POST' }));

  // Get push subscription and send notification
  const deviceResp = await deviceDO.fetch(new Request('http://internal/get'));
  if (deviceResp.ok) {
    const deviceData = await deviceResp.json() as { pushSubscription?: PushSubscriptionData };
    if (deviceData.pushSubscription) {
      // Send push notification in background
      ctx.waitUntil(
        sendPushNotification(
          deviceData.pushSubscription,
          {
            title: 'Claude needs approval',
            body: `${data.payload.tool}: ${data.payload.command || data.payload.details || 'Action required'}`,
            data: { requestId: data.requestId },
            tag: data.requestId,
            requireInteraction: true,
          },
          {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT,
          }
        )
      );
    }
  }

  return jsonResponse({ success: true, data: { requestId: data.requestId } });
}

async function handleGetRequest(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  // Extract pairingId from query params
  const url = new URL(request.url);
  const pairingId = url.searchParams.get('pairingId');

  if (!pairingId) {
    return jsonResponse({ success: false, error: 'pairingId required' }, 400);
  }

  const requestsId = env.APPROVAL_REQUESTS.idFromName(pairingId);
  const requestsDO = env.APPROVAL_REQUESTS.get(requestsId);

  const resp = await requestsDO.fetch(new Request(`http://internal/get/${requestId}`));
  const data = await resp.json();

  if (!resp.ok) {
    return jsonResponse({ success: false, error: (data as { error: string }).error }, resp.status);
  }

  return jsonResponse({ success: true, data });
}

async function handleDecision(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  const body = await request.text();
  const data = JSON.parse(body) as DecisionRequest & { pairingId: string };

  // Validate request
  const validation = await validateSignedRequest(data, body, `/api/decision/${requestId}`, 'POST', env);
  if (!validation.valid) {
    return jsonResponse({ success: false, error: validation.error }, 401);
  }

  const requestsId = env.APPROVAL_REQUESTS.idFromName(data.pairingId);
  const requestsDO = env.APPROVAL_REQUESTS.get(requestsId);

  const resp = await requestsDO.fetch(new Request(`http://internal/decide/${requestId}`, {
    method: 'POST',
    body: JSON.stringify({ decision: data.decision }),
  }));

  const result = await resp.json();

  if (!resp.ok) {
    return jsonResponse({ success: false, error: (result as { error: string }).error }, resp.status);
  }

  return jsonResponse({ success: true, data: result });
}

async function handlePollDecision(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  const url = new URL(request.url);
  const pairingId = url.searchParams.get('pairingId');
  const ts = url.searchParams.get('ts');
  const nonce = url.searchParams.get('nonce');
  const signature = url.searchParams.get('signature');

  if (!pairingId || !ts || !nonce || !signature) {
    return jsonResponse({ success: false, error: 'Missing auth params' }, 400);
  }

  // Validate signature for GET request
  const validation = await validateSignedRequest(
    { pairingId, ts: parseInt(ts), nonce, signature },
    '',
    `/api/decision/${requestId}`,
    'GET',
    env
  );
  if (!validation.valid) {
    return jsonResponse({ success: false, error: validation.error }, 401);
  }

  const requestsId = env.APPROVAL_REQUESTS.idFromName(pairingId);
  const requestsDO = env.APPROVAL_REQUESTS.get(requestsId);

  const resp = await requestsDO.fetch(new Request(`http://internal/get/${requestId}`));
  const data = await resp.json();

  if (!resp.ok) {
    return jsonResponse({ success: false, error: (data as { error: string }).error }, resp.status);
  }

  const approvalRequest = data as { status: string };
  return jsonResponse({ success: true, data: { status: approvalRequest.status } });
}

async function validateSignedRequest(
  data: { pairingId: string; ts: number; nonce: string; signature: string },
  body: string,
  path: string,
  method: string,
  env: Env
): Promise<{ valid: boolean; error?: string }> {
  // Check timestamp
  if (!isTimestampValid(data.ts)) {
    return { valid: false, error: 'Timestamp out of range' };
  }

  // Get device data
  const deviceId = env.DEVICE_REGISTRY.idFromName(data.pairingId);
  const deviceDO = env.DEVICE_REGISTRY.get(deviceId);

  const deviceResp = await deviceDO.fetch(new Request('http://internal/get'));
  if (!deviceResp.ok) {
    return { valid: false, error: 'Device not found' };
  }

  const deviceData = await deviceResp.json() as { pairingSecret: string };

  // Check nonce
  const nonceResp = await deviceDO.fetch(new Request('http://internal/check-nonce', {
    method: 'POST',
    body: JSON.stringify({ nonce: data.nonce }),
  }));
  const nonceResult = await nonceResp.json() as { valid: boolean; error?: string };
  if (!nonceResult.valid) {
    return { valid: false, error: nonceResult.error || 'Invalid nonce' };
  }

  // Verify signature
  const bodyHash = body ? await hashBody(body) : await hashBody('');
  const canonicalString = buildCanonicalString(method, path, bodyHash, data.ts, data.nonce);

  const isValid = await verifySignature(deviceData.pairingSecret, canonicalString, data.signature);
  if (!isValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}

function jsonResponse(data: ApiResponse, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
