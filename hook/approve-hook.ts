#!/usr/bin/env tsx
/**
 * Claude Code Approval Hook (TypeScript version)
 *
 * This hook intercepts Claude Code tool calls and sends approval requests
 * to your phone via push notification.
 *
 * Usage:
 * Add to your .claude/settings.json:
 * {
 *   "hooks": {
 *     "PreToolUse": [{
 *       "matcher": "Bash|Write|Edit",
 *       "hooks": [{ "type": "command", "command": "tsx /path/to/approve-hook.ts" }]
 *     }]
 *   }
 * }
 */

import { loadConfig } from '../packages/cli/src/config.js';
import { createApprovalRequest, pollDecision } from '../packages/cli/src/api.js';
import { generateId } from '../packages/cli/src/crypto.js';
import type { RequestPayload } from '@claude-notifier/shared';

interface HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

interface HookOutput {
  decision: 'approve' | 'deny';
  reason?: string;
}

async function main() {
  // Read input from stdin
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let hookInput: HookInput;
  try {
    hookInput = JSON.parse(input);
  } catch {
    // If we can't parse input, approve by default
    output({ decision: 'approve' });
    return;
  }

  const { tool_name, tool_input } = hookInput;

  // Load config
  const config = await loadConfig();
  if (!config) {
    // Not configured, approve by default
    console.error('claude-approve: Not configured, approving by default');
    output({ decision: 'approve' });
    return;
  }

  // Build payload based on tool type
  const payload = buildPayload(tool_name, tool_input);

  try {
    // Create approval request
    const requestId = generateId();
    const result = await createApprovalRequest(config, requestId, payload);

    if (!result.success) {
      console.error('claude-approve: Failed to create request:', result.error);
      output({ decision: 'approve' }); // Fail open
      return;
    }

    // Poll for decision (10 minute timeout)
    const timeout = 10 * 60 * 1000;
    const pollInterval = 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await sleep(pollInterval);

      const decision = await pollDecision(config, requestId);

      if (!decision.success) {
        continue;
      }

      const status = decision.data?.status;

      if (status === 'allowed') {
        output({ decision: 'approve' });
        return;
      } else if (status === 'denied') {
        output({ decision: 'deny', reason: 'Denied via mobile approval' });
        return;
      } else if (status === 'expired') {
        output({ decision: 'deny', reason: 'Request expired' });
        return;
      }
    }

    // Timeout
    output({ decision: 'deny', reason: 'Approval request timed out' });
  } catch (error) {
    console.error('claude-approve: Error:', error);
    output({ decision: 'approve' }); // Fail open
  }
}

function buildPayload(tool: string, input: Record<string, unknown>): RequestPayload {
  const payload: RequestPayload = {
    tool,
    cwd: process.cwd(),
  };

  switch (tool) {
    case 'Bash':
      payload.command = String(input.command || '');
      break;
    case 'Write':
      payload.details = `Write to: ${input.file_path}`;
      break;
    case 'Edit':
      payload.details = `Edit: ${input.file_path}`;
      if (input.old_string) {
        const preview = String(input.old_string).slice(0, 100);
        payload.details += `\nReplace: ${preview}...`;
      }
      break;
    default:
      payload.details = JSON.stringify(input).slice(0, 200);
  }

  return payload;
}

function output(result: HookOutput) {
  console.log(JSON.stringify(result));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
