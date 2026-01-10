import type { PushSubscriptionData } from '@claude-notifier/shared';
import { NONCE_TTL_SECONDS, RATE_LIMIT_WINDOW_SECONDS, MAX_REQUESTS_PER_WINDOW } from '@claude-notifier/shared';

interface DeviceData {
  pairingId: string;
  pairingSecret: string;
  pushSubscription?: PushSubscriptionData;
  createdAt: number;
}

/**
 * Durable Object for managing device registrations
 * One instance per pairingId
 */
export class DeviceRegistryDO implements DurableObject {
  private state: DurableObjectState;
  private deviceData: DeviceData | null = null;
  private usedNonces: Map<string, number> = new Map();
  private requestCount: number = 0;
  private rateLimitWindowStart: number = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      this.deviceData = await this.state.storage.get('deviceData') || null;
      this.usedNonces = (await this.state.storage.get('usedNonces')) || new Map();
      this.requestCount = (await this.state.storage.get('requestCount')) || 0;
      this.rateLimitWindowStart = (await this.state.storage.get('rateLimitWindowStart')) || 0;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/register' && request.method === 'POST') {
        return this.handleRegister(request);
      }
      if (path === '/register-push' && request.method === 'POST') {
        return this.handleRegisterPush(request);
      }
      if (path === '/get' && request.method === 'GET') {
        return this.handleGet();
      }
      if (path === '/check-nonce' && request.method === 'POST') {
        return this.handleCheckNonce(request);
      }
      if (path === '/check-rate-limit' && request.method === 'GET') {
        return this.handleCheckRateLimit();
      }
      if (path === '/increment-request' && request.method === 'POST') {
        return this.handleIncrementRequest();
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('DeviceRegistryDO error:', error);
      return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
    }
  }

  private async handleRegister(request: Request): Promise<Response> {
    const data = await request.json() as { pairingId: string; pairingSecret: string };

    this.deviceData = {
      pairingId: data.pairingId,
      pairingSecret: data.pairingSecret,
      createdAt: Date.now(),
    };

    await this.state.storage.put('deviceData', this.deviceData);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleRegisterPush(request: Request): Promise<Response> {
    if (!this.deviceData) {
      return new Response(JSON.stringify({ error: 'Device not registered' }), { status: 404 });
    }

    const data = await request.json() as { pushSubscription: PushSubscriptionData };
    this.deviceData.pushSubscription = data.pushSubscription;
    await this.state.storage.put('deviceData', this.deviceData);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleGet(): Response {
    if (!this.deviceData) {
      return new Response(JSON.stringify({ error: 'Device not found' }), { status: 404 });
    }

    return new Response(JSON.stringify(this.deviceData), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleCheckNonce(request: Request): Promise<Response> {
    const { nonce } = await request.json() as { nonce: string };
    const now = Math.floor(Date.now() / 1000);

    // Clean up old nonces
    for (const [n, ts] of this.usedNonces.entries()) {
      if (now - ts > NONCE_TTL_SECONDS) {
        this.usedNonces.delete(n);
      }
    }

    if (this.usedNonces.has(nonce)) {
      return new Response(JSON.stringify({ valid: false, error: 'Nonce already used' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    this.usedNonces.set(nonce, now);
    await this.state.storage.put('usedNonces', this.usedNonces);

    return new Response(JSON.stringify({ valid: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleCheckRateLimit(): Promise<Response> {
    const now = Math.floor(Date.now() / 1000);

    // Reset window if expired
    if (now - this.rateLimitWindowStart > RATE_LIMIT_WINDOW_SECONDS) {
      this.rateLimitWindowStart = now;
      this.requestCount = 0;
      await this.state.storage.put('rateLimitWindowStart', this.rateLimitWindowStart);
      await this.state.storage.put('requestCount', this.requestCount);
    }

    const allowed = this.requestCount < MAX_REQUESTS_PER_WINDOW;

    return new Response(JSON.stringify({ allowed, remaining: MAX_REQUESTS_PER_WINDOW - this.requestCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleIncrementRequest(): Promise<Response> {
    this.requestCount++;
    await this.state.storage.put('requestCount', this.requestCount);

    return new Response(JSON.stringify({ count: this.requestCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
