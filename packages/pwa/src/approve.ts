// Approve page logic
import { getPairingData } from './storage';
import { getRequest, submitDecision } from './api';

let expiryInterval: number | null = null;

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const requestId = urlParams.get('id');
  const quickAction = urlParams.get('action');

  if (!requestId) {
    showError('No request ID provided');
    return;
  }

  const pairingData = await getPairingData();
  if (!pairingData) {
    showError('Device not paired. Please pair first.');
    return;
  }

  // Handle quick action from notification
  if (quickAction === 'allow' || quickAction === 'deny') {
    await handleDecision(pairingData, requestId, quickAction, 'once');
    return;
  }

  // Load request details
  try {
    const result = await getRequest(pairingData, requestId);

    if (!result.success || !result.data) {
      showError(result.error || 'Request not found');
      return;
    }

    const request = result.data;

    // Check if already decided
    if (request.status !== 'pending') {
      showDecided(request.status as 'allowed' | 'denied' | 'expired');
      return;
    }

    // Show request details
    showRequest(request);

    // Setup buttons with scope
    const tool = request.payload.tool;

    document.getElementById('approve-once-btn')!.addEventListener('click', () => {
      handleDecision(pairingData, requestId, 'allow', 'once');
    });

    document.getElementById('approve-tool-btn')!.addEventListener('click', () => {
      handleDecision(pairingData, requestId, 'allow', 'session-tool');
    });

    document.getElementById('approve-all-btn')!.addEventListener('click', () => {
      handleDecision(pairingData, requestId, 'allow', 'session-all');
    });

    document.getElementById('deny-btn')!.addEventListener('click', () => {
      handleDecision(pairingData, requestId, 'deny', 'once');
    });

    // Start expiry countdown
    startExpiryCountdown(request.expiresAt);
  } catch (error) {
    console.error('Load request error:', error);
    showError('Failed to load request: ' + error);
  }
}

function showRequest(request: {
  requestId: string;
  payload: {
    tool: string;
    command?: string;
    args?: string[];
    cwd?: string;
    details?: string;
  };
  createdAt: number;
  expiresAt: number;
}) {
  document.getElementById('loading')!.classList.add('hidden');
  document.getElementById('request-details')!.classList.remove('hidden');

  const { payload, createdAt } = request;

  // Tool badge
  document.getElementById('request-tool')!.textContent = payload.tool;

  // Update tool name in button
  document.getElementById('tool-name')!.textContent = payload.tool;

  // Time
  const timeAgo = formatTimeAgo(createdAt);
  document.getElementById('request-time')!.textContent = timeAgo;

  // Title
  const title = getTitleForTool(payload.tool);
  document.getElementById('request-title')!.textContent = title;

  // Command
  if (payload.command || payload.args) {
    const command = payload.command || payload.args?.join(' ') || '';
    document.getElementById('request-command')!.textContent = command;
    document.getElementById('command-section')!.classList.remove('hidden');
  } else {
    document.getElementById('command-section')!.classList.add('hidden');
  }

  // Details
  if (payload.details) {
    document.getElementById('request-details-content')!.textContent = payload.details;
    document.getElementById('details-section')!.classList.remove('hidden');
  }

  // Working directory
  if (payload.cwd) {
    document.getElementById('request-cwd')!.textContent = payload.cwd;
    document.getElementById('cwd-section')!.classList.remove('hidden');
  }
}

async function handleDecision(
  pairingData: { pairingId: string; pairingSecret: string },
  requestId: string,
  decision: 'allow' | 'deny',
  scope: 'once' | 'session-tool' | 'session-all'
) {
  // Disable all buttons
  const buttons = [
    document.getElementById('approve-once-btn'),
    document.getElementById('approve-tool-btn'),
    document.getElementById('approve-all-btn'),
    document.getElementById('deny-btn')
  ];

  buttons.forEach(btn => {
    if (btn) (btn as HTMLButtonElement).disabled = true;
  });

  try {
    const result = await submitDecision(pairingData, requestId, decision, scope);

    if (result.success) {
      showDecided(decision === 'allow' ? 'allowed' : 'denied', scope);
    } else {
      alert('Failed to submit decision: ' + result.error);
      buttons.forEach(btn => {
        if (btn) (btn as HTMLButtonElement).disabled = false;
      });
    }
  } catch (error) {
    console.error('Decision error:', error);
    alert('Failed to submit decision: ' + error);
    buttons.forEach(btn => {
      if (btn) (btn as HTMLButtonElement).disabled = false;
    });
  }
}

function showDecided(status: 'allowed' | 'denied' | 'expired', scope?: 'once' | 'session-tool' | 'session-all') {
  if (expiryInterval) {
    clearInterval(expiryInterval);
  }

  document.getElementById('loading')!.classList.add('hidden');
  document.getElementById('request-details')!.classList.add('hidden');
  document.getElementById('request-decided')!.classList.remove('hidden');

  const icon = document.getElementById('decided-icon')!;
  const title = document.getElementById('decided-title')!;
  const message = document.getElementById('decided-message')!;

  if (status === 'allowed') {
    icon.textContent = '✓';
    icon.className = 'decision-icon approved';
    title.textContent = 'Approved';

    if (scope === 'session-tool') {
      message.textContent = 'Approved! All future requests for this tool in this session will be auto-approved.';
    } else if (scope === 'session-all') {
      message.textContent = 'Approved! All future requests in this session will be auto-approved.';
    } else {
      message.textContent = 'The request has been approved. Claude Code will continue.';
    }
  } else if (status === 'denied') {
    icon.textContent = '✕';
    icon.className = 'decision-icon denied';
    title.textContent = 'Denied';
    message.textContent = 'The request has been denied. Claude Code will stop.';
  } else {
    icon.textContent = '⏱';
    icon.className = 'decision-icon';
    icon.style.background = 'var(--text-muted)';
    title.textContent = 'Expired';
    message.textContent = 'This request has expired.';
  }
}

function showError(message: string) {
  document.getElementById('loading')!.classList.add('hidden');
  document.getElementById('request-error')!.classList.remove('hidden');
  document.getElementById('request-error-message')!.textContent = message;
}

function startExpiryCountdown(expiresAt: number) {
  const expiresEl = document.getElementById('expires-time')!;

  const update = () => {
    const remaining = Math.max(0, expiresAt - Date.now());
    const seconds = Math.floor(remaining / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    expiresEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    if (remaining <= 0) {
      if (expiryInterval) clearInterval(expiryInterval);
      showDecided('expired');
    }
  };

  update();
  expiryInterval = window.setInterval(update, 1000);
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 120) return '1 minute ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;

  return 'A while ago';
}

function getTitleForTool(tool: string): string {
  const titles: Record<string, string> = {
    Bash: 'Claude wants to run a command',
    Write: 'Claude wants to write a file',
    Edit: 'Claude wants to edit a file',
    Read: 'Claude wants to read a file',
    Task: 'Claude wants to run a task',
  };
  return titles[tool] || `Claude wants to use ${tool}`;
}

init();
