import { loadConfig } from '../config.js';
import { createApprovalRequest, pollDecision } from '../api.js';
import { generateId } from '../crypto.js';
import type { RequestPayload } from '@claude-notifier/shared';

interface RequestOptions {
  tool: string;
  command?: string;
  details?: string;
  cwd?: string;
  timeout: string;
}

export async function requestApproval(options: RequestOptions) {
  const config = await loadConfig();

  if (!config) {
    console.error('❌ Not paired. Run "claude-approve init" first.');
    process.exit(1);
  }

  const requestId = generateId();
  const timeout = parseInt(options.timeout, 10);

  const payload: RequestPayload = {
    tool: options.tool,
    command: options.command,
    details: options.details,
    cwd: options.cwd || process.cwd(),
  };

  // Create request
  try {
    const result = await createApprovalRequest(config, requestId, payload);

    if (!result.success) {
      console.error('❌ Failed to create request:', result.error);
      process.exit(1);
    }

    // Poll for decision
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < timeout) {
      await sleep(pollInterval);

      const decision = await pollDecision(config, requestId);

      if (!decision.success) {
        continue; // Keep polling
      }

      const status = decision.data?.status;

      if (status === 'allowed') {
        // Exit with success - allow the action
        process.exit(0);
      } else if (status === 'denied') {
        // Exit with error - deny the action
        console.error('❌ Request denied');
        process.exit(1);
      } else if (status === 'expired') {
        console.error('⏱️ Request expired');
        process.exit(1);
      }
      // status === 'pending' - keep polling
    }

    console.error('⏱️ Request timed out');
    process.exit(1);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
