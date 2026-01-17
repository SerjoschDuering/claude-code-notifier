// Shared utility functions for PWA

import { API_BASE } from './api';

/**
 * Convert URL-safe base64 to Uint8Array for VAPID keys
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Copy text to clipboard with iOS Safari fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  console.log('[copyToClipboard] Text length:', text?.length || 0);
  console.log('[copyToClipboard] First 100 chars:', text?.substring(0, 100));

  if (!text || text.length === 0) {
    console.error('[copyToClipboard] ERROR: Empty text!');
    alert('Error: Setup prompt is empty. Please reload the app.');
    return false;
  }

  // Try modern clipboard API first
  try {
    await navigator.clipboard.writeText(text);
    console.log('[copyToClipboard] Success via navigator.clipboard');
    return true;
  } catch (err) {
    console.warn('[copyToClipboard] navigator.clipboard failed:', err);
  }

  // Fallback for iOS Safari
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.cssText = 'position:fixed;left:-9999px;top:0;';
    textArea.setAttribute('readonly', ''); // Prevent keyboard popup on iOS
    document.body.appendChild(textArea);

    // iOS specific selection
    const range = document.createRange();
    range.selectNodeContents(textArea);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    textArea.setSelectionRange(0, text.length); // For iOS

    const success = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (success) {
      console.log('[copyToClipboard] Success via execCommand fallback');
      return true;
    } else {
      console.error('[copyToClipboard] execCommand returned false');
      alert('Copy failed. Please use the preview below and copy manually.');
      return false;
    }
  } catch (err) {
    console.error('[copyToClipboard] Fallback failed:', err);
    alert('Copy failed. Please use the preview below and copy manually.');
    return false;
  }
}

/**
 * Show toast notification
 */
export function showToast(msg: string, type: 'success' | 'error' = 'success'): void {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/**
 * Derive worker URL from API_BASE constant
 */
export function deriveWorkerUrl(): string {
  try {
    const u = new URL(API_BASE, location.origin);
    if (u.pathname.endsWith('/api')) u.pathname = u.pathname.replace(/\/api$/, '');
    return u.href.replace(/\/$/, '');
  } catch {
    return API_BASE.replace(/\/api$/, '');
  }
}
