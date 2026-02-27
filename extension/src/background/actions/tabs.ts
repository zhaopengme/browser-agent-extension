/**
 * Tab management actions: get_tabs, switch_tab
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

export const tabHandlers: Record<string, NoPageActionHandler> = {
  get_tabs,
  switch_tab,
};
