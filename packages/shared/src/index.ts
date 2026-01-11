// Shared types for Claude Code Notifier

export type ApprovalScope = 'once' | 'session-tool' | 'session-all';

export interface PairingData {
  pairingId: string;
  pairingSecret: string; // Base64 encoded 32-byte secret for HMAC
  createdAt: number;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface ApprovalRequest {
  requestId: string;
  pairingId: string;
  payload: RequestPayload;
  status: 'pending' | 'allowed' | 'denied' | 'expired';
  approvalScope?: ApprovalScope; // Scope of approval (once, session-tool, session-all)
  createdAt: number;
  expiresAt: number;
}

export interface RequestPayload {
  tool: string;
  command?: string;
  args?: string[];
  cwd?: string;
  details?: string;
}

export interface SignedRequest {
  pairingId: string;
  ts: number;
  nonce: string;
  signature: string; // HMAC-SHA256 signature
}

export interface RegisterPushRequest extends SignedRequest {
  pushSubscription: PushSubscriptionData;
}

export interface CreateApprovalRequest extends SignedRequest {
  requestId: string;
  payload: RequestPayload;
}

export interface DecisionRequest extends SignedRequest {
  decision: 'allow' | 'deny';
  scope?: ApprovalScope; // Scope of approval for session caching
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Constants
export const REQUEST_TTL_SECONDS = 120; // 2 minutes
export const NONCE_TTL_SECONDS = 600;
export const MAX_PENDING_REQUESTS = 2000;
export const MAX_REQUESTS_PER_WINDOW = 30;
export const RATE_LIMIT_WINDOW_SECONDS = 600;
export const MAX_TIMESTAMP_DRIFT_SECONDS = 60;
export const MAX_PAYLOAD_SIZE_BYTES = 8192; // 8 KB
