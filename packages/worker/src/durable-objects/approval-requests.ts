import type { ApprovalRequest, RequestPayload } from '@claude-notifier/shared';
import { REQUEST_TTL_SECONDS, MAX_PENDING_REQUESTS } from '@claude-notifier/shared';

/**
 * Durable Object for managing approval requests
 * One instance per pairingId
 */
export class ApprovalRequestsDO implements DurableObject {
  private state: DurableObjectState;
  private requests: Map<string, ApprovalRequest> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('requests');
      if (stored) {
        this.requests = new Map(Object.entries(stored as Record<string, ApprovalRequest>));
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Clean up expired requests
      await this.cleanupExpired();

      if (path === '/create' && request.method === 'POST') {
        return this.handleCreate(request);
      }
      if (path.startsWith('/get/') && request.method === 'GET') {
        const requestId = path.replace('/get/', '');
        return this.handleGet(requestId);
      }
      if (path.startsWith('/decide/') && request.method === 'POST') {
        const requestId = path.replace('/decide/', '');
        return this.handleDecide(request, requestId);
      }
      if (path === '/pending-count' && request.method === 'GET') {
        return this.handlePendingCount();
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('ApprovalRequestsDO error:', error);
      return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
    }
  }

  private async cleanupExpired(): Promise<void> {
    const now = Date.now();
    let changed = false;

    for (const [id, req] of this.requests.entries()) {
      if (req.status === 'pending' && now > req.expiresAt) {
        req.status = 'expired';
        changed = true;
      }
    }

    if (changed) {
      await this.saveRequests();
    }
  }

  private async handleCreate(request: Request): Promise<Response> {
    const data = await request.json() as {
      requestId: string;
      pairingId: string;
      payload: RequestPayload;
    };

    // Check pending count
    const pendingCount = this.getPendingCount();
    if (pendingCount >= MAX_PENDING_REQUESTS) {
      return new Response(
        JSON.stringify({ error: 'Too many pending requests', code: 'RATE_LIMITED' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const now = Date.now();
    const approvalRequest: ApprovalRequest = {
      requestId: data.requestId,
      pairingId: data.pairingId,
      payload: data.payload,
      status: 'pending',
      createdAt: now,
      expiresAt: now + REQUEST_TTL_SECONDS * 1000,
    };

    this.requests.set(data.requestId, approvalRequest);
    await this.saveRequests();

    return new Response(JSON.stringify({ success: true, request: approvalRequest }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleGet(requestId: string): Response {
    const req = this.requests.get(requestId);

    if (!req) {
      return new Response(JSON.stringify({ error: 'Request not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(req), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleDecide(request: Request, requestId: string): Promise<Response> {
    const { decision } = await request.json() as { decision: 'allow' | 'deny' };

    const req = this.requests.get(requestId);

    if (!req) {
      return new Response(JSON.stringify({ error: 'Request not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (req.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Request already decided', status: req.status }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    req.status = decision === 'allow' ? 'allowed' : 'denied';
    await this.saveRequests();

    return new Response(JSON.stringify({ success: true, status: req.status }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handlePendingCount(): Response {
    return new Response(JSON.stringify({ count: this.getPendingCount() }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private getPendingCount(): number {
    let count = 0;
    for (const req of this.requests.values()) {
      if (req.status === 'pending') count++;
    }
    return count;
  }

  private async saveRequests(): Promise<void> {
    const obj: Record<string, ApprovalRequest> = {};
    for (const [id, req] of this.requests.entries()) {
      obj[id] = req;
    }
    await this.state.storage.put('requests', obj);
  }
}
