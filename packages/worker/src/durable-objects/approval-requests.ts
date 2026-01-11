import type { ApprovalRequest, RequestPayload } from '@claude-notifier/shared';
import { REQUEST_TTL_SECONDS, MAX_PENDING_REQUESTS } from '@claude-notifier/shared';

/**
 * Durable Object for managing approval requests
 * One instance per pairingId
 */
export class ApprovalRequestsDO implements DurableObject {
  private state: DurableObjectState;
  private requests: Map<string, ApprovalRequest> = new Map();
  private pendingRequestIds: Set<string> = new Set();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      const legacy = await this.state.storage.get<Record<string, ApprovalRequest>>('requests');
      if (legacy) {
        const writes: Promise<unknown>[] = [];
        for (const [id, req] of Object.entries(legacy)) {
          writes.push(this.state.storage.put(this.getRequestStorageKey(id), req));
        }
        if (writes.length) {
          await Promise.all(writes);
        }
        await this.state.storage.delete('requests');
      }

      const stored = await this.state.storage.list<ApprovalRequest>({ prefix: 'request:' });
      for (const [storageKey, req] of stored.entries()) {
        const id = storageKey.replace('request:', '');
        this.requests.set(id, req);
        if (req.status === 'pending') {
          this.pendingRequestIds.add(id);
        }
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
      if (path === '/list-pending' && request.method === 'GET') {
        return this.handleListPending();
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('ApprovalRequestsDO error:', error);
      return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
    }
  }

  private async cleanupExpired(): Promise<void> {
    const now = Date.now();
    const deleteKeys: string[] = [];

    for (const [id, req] of this.requests.entries()) {
      if (req.status === 'pending' && now > req.expiresAt) {
        this.requests.delete(id);
        this.pendingRequestIds.delete(id);
        deleteKeys.push(this.getRequestStorageKey(id));
      }
    }

    if (deleteKeys.length) {
      await this.state.storage.delete(deleteKeys);
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
    this.pendingRequestIds.add(data.requestId);
    await this.persistRequest(approvalRequest);

    return new Response(JSON.stringify({ success: true, request: approvalRequest }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleGet(requestId: string): Response {
    const req = this.requests.get(requestId);

    if (!req) {
      return new Response(JSON.stringify({ error: 'Request not found or expired' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(req), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleDecide(request: Request, requestId: string): Promise<Response> {
    const { decision, scope } = await request.json() as { decision: 'allow' | 'deny'; scope?: string };

    const req = this.requests.get(requestId);

    if (!req) {
      return new Response(JSON.stringify({ error: 'Request not found or expired' }), {
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
    if (scope) {
      req.approvalScope = scope as 'once' | 'session-tool' | 'session-all';
    }
    this.pendingRequestIds.delete(requestId);
    await this.persistRequest(req);

    return new Response(JSON.stringify({ success: true, status: req.status, scope: req.approvalScope }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handlePendingCount(): Response {
    return new Response(JSON.stringify({ count: this.getPendingCount() }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleListPending(): Response {
    const pending: ApprovalRequest[] = [];
    for (const req of this.requests.values()) {
      if (req.status === 'pending') {
        pending.push(req);
      }
    }
    // Sort by creation time, newest first
    pending.sort((a, b) => b.createdAt - a.createdAt);
    return new Response(JSON.stringify({ requests: pending }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private getPendingCount(): number {
    return this.pendingRequestIds.size;
  }

  private getRequestStorageKey(requestId: string): string {
    return `request:${requestId}`;
  }

  private persistRequest(request: ApprovalRequest): Promise<void> {
    return this.state.storage.put(this.getRequestStorageKey(request.requestId), request);
  }
}
