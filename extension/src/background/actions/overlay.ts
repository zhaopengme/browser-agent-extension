/**
 * Overlay actions: lock, unlock, update_status
 */

import { getTargetTabId } from '../utils/tab-utils';
import type { NoPageActionHandler } from '../router';
import { requireParam } from '../utils/validate';

async function sendOverlayMessage(type: string, payload: unknown, tabId?: number): Promise<void> {
  try {
    const targetTabId = await getTargetTabId(tabId);
    if (targetTabId) {
      await chrome.tabs.sendMessage(targetTabId, { type, payload });
    }
  } catch (error) {
    console.debug(`[Background] ${type} failed:`, error);
  }
}

const lock: NoPageActionHandler = async (params, tabId) => {
  const status = (params.status as string) || 'Agent is controlling this page';
  await sendOverlayMessage('SHOW_OVERLAY', { status }, tabId);
  return { locked: true, status };
};

const unlock: NoPageActionHandler = async (_params, tabId) => {
  await sendOverlayMessage('HIDE_OVERLAY', undefined, tabId);
  return { unlocked: true };
};

const update_status: NoPageActionHandler = async (params, tabId) => {
  const status = requireParam<string>(params, 'status', 'string');
  await sendOverlayMessage('UPDATE_OVERLAY_STATUS', { status, shimmer: params.shimmer }, tabId);
  return { updated: true, status };
};

export const overlayHandlers: Record<string, NoPageActionHandler> = {
  lock,
  unlock,
  update_status,
};
