/**
 * Tab utilities for background service worker
 */

/**
 * Get the target tab ID: use provided tabId or fall back to active tab
 */
export async function getTargetTabId(tabId?: number): Promise<number | undefined> {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}
