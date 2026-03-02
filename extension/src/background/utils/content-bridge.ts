/**
 * Content script communication bridge
 * Provides a unified interface for sending messages to content scripts
 */

import { getTargetTabId } from './tab-utils';
import { withRetry } from './retry';
import { BrowserAgentError } from '@/types/errors';

const PING_RETRIES = 5;
const PING_INTERVAL_MS = 500;

/**
 * Send a PING and resolve true if content script responds, false otherwise.
 */
async function pingContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the actual content script module path from manifest's web_accessible_resources.
 * CRXJS puts the real module (e.g. "assets/index.ts-XXXX.js") there.
 */
function getContentScriptModulePath(): string | null {
  const manifest = chrome.runtime.getManifest();
  const resources = manifest.web_accessible_resources;
  if (!resources) return null;

  for (const entry of resources) {
    const res = (entry as { resources?: string[] }).resources;
    if (!res) continue;
    const match = res.find(
      r => r.startsWith('assets/index.ts-') && r.endsWith('.js') && !r.endsWith('.map')
    );
    if (match) return match;
  }
  return null;
}

/**
 * Ensure content script is injected into the specified tab.
 *
 * Strategy:
 * 1. PING the content script — if it responds, we're good.
 * 2. If PING fails, retry several times with delay (manifest-declared
 *    content scripts auto-inject but may not be ready yet after navigation).
 * 3. If all PINGs fail (e.g. tab existed before extension was installed),
 *    programmatically inject by dynamically importing the actual module
 *    (NOT the CRXJS loader, which doesn't work with executeScript).
 */
export async function ensureContentScriptInjected(tabId: number): Promise<void> {
  if (await pingContentScript(tabId)) return;

  console.log('[Background] Content script not responding, waiting for auto-injection...');

  for (let i = 0; i < PING_RETRIES; i++) {
    await new Promise(resolve => setTimeout(resolve, PING_INTERVAL_MS));
    if (await pingContentScript(tabId)) {
      console.log(`[Background] Content script responded after ${i + 1} retries`);
      return;
    }
  }

  console.log('[Background] Auto-injection timed out, attempting programmatic injection...');
  const modulePath = getContentScriptModulePath();
  if (!modulePath) {
    throw new BrowserAgentError(
      'Cannot determine content script module path from manifest.',
      'CONTENT_SCRIPT_ERROR'
    );
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (path: string) => {
        const url = chrome.runtime.getURL(path);
        import(/* @vite-ignore */ url);
      },
      args: [modulePath],
      world: 'ISOLATED' as chrome.scripting.ExecutionWorld,
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!(await pingContentScript(tabId))) {
      throw new Error('Content script did not respond after programmatic injection');
    }
    console.log('[Background] Content script injected programmatically');
  } catch (injectError) {
    console.error('[Background] Failed to inject content script:', injectError);
    throw new BrowserAgentError(
      'Failed to inject content script. This page may not support browser automation (e.g., chrome:// pages).',
      'CONTENT_SCRIPT_ERROR'
    );
  }
}

/**
 * Send a command to the content script in the target tab.
 * Handles tab resolution and content script injection automatically.
 * Retries once on retryable errors (e.g., content script not yet ready).
 */
export async function sendContentCommand<T>(
  type: string,
  payload: unknown,
  tabId?: number
): Promise<T> {
  return withRetry(async () => {
    const targetTabId = await getTargetTabId(tabId);
    if (!targetTabId) throw new BrowserAgentError('No active tab found', 'TAB_NOT_FOUND');
    await ensureContentScriptInjected(targetTabId);
    const response = await chrome.tabs.sendMessage(targetTabId, { type, payload });
    if (!response.success) {
      throw new BrowserAgentError(
        response.error || `Failed: ${type}`,
        'CONTENT_SCRIPT_ERROR',
        true
      );
    }
    return response.data;
  }, { retries: 1, delay: 300 });
}
