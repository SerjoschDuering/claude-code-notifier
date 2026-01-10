import { ApprovalRequestsDO } from './durable-objects/approval-requests';
import { DeviceRegistryDO } from './durable-objects/device-registry';
import { handleApiRequest } from './api';

export { ApprovalRequestsDO, DeviceRegistryDO };

export interface Env {
  APPROVAL_REQUESTS: DurableObjectNamespace;
  DEVICE_REGISTRY: DurableObjectNamespace;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  ENVIRONMENT: string;
  PWA_ORIGIN?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for PWA - restrict to specific origin in production
    const allowedOrigin = env.ENVIRONMENT === 'development'
      ? '*'
      : (env.PWA_ORIGIN || 'https://claude-approver.pages.dev');

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      try {
        const response = await handleApiRequest(request, env, ctx);
        // Add CORS headers to response
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      } catch (error) {
        console.error('API error:', error);
        return new Response(
          JSON.stringify({ success: false, error: 'Internal server error' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
