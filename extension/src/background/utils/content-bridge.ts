/**
 * Content script communication bridge
 * Provides a unified interface for sending messages to content scripts
 */

import { getTargetTabId } from './tab-utils';
import { withRetry } from './retry';
import { BrowserAgentError } from '@/types/errors';

/**
 * Get content script file path from manifest
 */
function getContentScriptPath(): string {
  const manifest = chrome.runtime.getManifest();
  const contentScripts = manifest.content_scripts;
  if (contentScripts && contentScripts.length > 0 && contentScripts[0].js) {
    return contentScripts[0].js[0];
  }
  return 'src/content/index.ts';
}

/**
 * Ensure content script is injected into the specified tab.
 * If not injected, attempts programmatic injection via chrome.scripting.
 */
export async function ensureContentScriptInjected(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    console.log('[Background] Content script not loaded, injecting...');
    try {
      const contentScriptPath = getContentScriptPath();
      console.log('[Background] Injecting content script:', contentScriptPath);
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [contentScriptPath],
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('[Background] Content script injected successfully');
    } catch (injectError) {
      console.error('[Background] Failed to inject content script:', injectError);
      throw new Error(
        'Failed to inject content script. This page may not support browser automation (e.g., chrome:// pages).'
      );
    }
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
