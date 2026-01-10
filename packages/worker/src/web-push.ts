import { buildPushPayload } from '@block65/webcrypto-web-push';
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
  actions?: Array<{ action: string; title: string }>;
}

/**
 * Send a Web Push notification using @block65/webcrypto-web-push
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload,
  vapidKeys: VapidKeys
): Promise<{ success: boolean; error?: string }> {
  try {
    // Build the push payload using the library
    const pushPayload = await buildPushPayload(
      {
        data: JSON.stringify(payload),
        options: {
          ttl: 86400, // 24 hours
        },
      },
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      {
        subject: vapidKeys.subject,
        publicKey: vapidKeys.publicKey,
        privateKey: vapidKeys.privateKey,
      }
    );

    // Send the request
    const response = await fetch(subscription.endpoint, pushPayload);

    if (!response.ok) {
      const text = await response.text();
      console.error('Push failed:', response.status, text);
      return { success: false, error: `Push failed: ${response.status} ${text}` };
    }

    return { success: true };
  } catch (error) {
    console.error('Push error:', error);
    return { success: false, error: String(error) };
  }
}
