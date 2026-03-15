/**
 * Tab management actions: get_tabs, switch_tab, create_tab, close_tab
 * These don't require a Page instance — they operate on browserContext directly.
 */

import { browserContext } from '@/cdp';
import type { NoPageActionHandler } from '../router';
import { requireParam } from '../utils/validate';

const get_tabs: NoPageActionHandler = async () => {
  const tabs = await browserContext.getAllTabsInfo();
  return { tabs };
};

const switch_tab: NoPageActionHandler = async (params) => {
  const tabId = requireParam<number>(params, 'tabId', 'number');
  await browserContext.switchToTab(tabId);
  return { switched: true };
};

const create_tab: NoPageActionHandler = async (params) => {
  const url = (params.url as string) || 'about:blank';
  const background = (params.background as boolean) || false;

  const tab = await chrome.tabs.create({ url, active: !background });

  if (!tab.id) {
    throw new Error('Failed to create tab — no tab ID returned');
  }

  return { tabId: tab.id, url: tab.url || url };
};

const close_tab: NoPageActionHandler = async (params) => {
  let tabId = params.tabId as number | undefined;

  // Default to current active tab
  if (!tabId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      throw new Error('No active tab found');
    }
    tabId = activeTab.id;
  }

  // Check if we're closing the active tab — need to switch to another
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isClosingActiveTab = activeTab?.id === tabId;

  // Get all tabs before closing, to find the most recent one to switch to
  let nextTabId: number | undefined;
  if (isClosingActiveTab) {
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const candidates = allTabs
      .filter(t => t.id !== tabId && t.id !== undefined)
      .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    nextTabId = candidates[0]?.id;
  }

  await chrome.tabs.remove(tabId);

  if (isClosingActiveTab && nextTabId) {
    await chrome.tabs.update(nextTabId, { active: true });
  }

  return { closed: true, activeTabId: nextTabId ?? activeTab?.id };
};

export const tabHandlers: Record<string, NoPageActionHandler> = {
  get_tabs,
  switch_tab,
  create_tab,
  close_tab,
};
