/**
 * Action router - dispatches MCP actions to the appropriate handler
 */

import type { Page } from '@/cdp';
import { browserContext } from '@/cdp';
import { overlayHandlers } from './actions/overlay';
import { navigationHandlers } from './actions/navigation';
import { interactionHandlers } from './actions/interaction';
import { mouseHandlers } from './actions/mouse';
import { infoHandlers } from './actions/info';
import { domHandlers } from './actions/dom';
import { tabHandlers } from './actions/tabs';
import { networkHandlers } from './actions/network';
import { waitHandlers } from './actions/wait';
import { dialogHandlers } from './actions/dialog';
import { consoleHandlers } from './actions/console';
import { downloadHandlers } from './actions/download';
import { cookieHandlers } from './actions/cookie';
import { BrowserAgentError } from '@/types/errors';

export interface ActionContext {
  page: Page;
  params: Record<string, unknown>;
  tabId?: number;
}

export type ActionHandler = (ctx: ActionContext) => Promise<unknown>;
export type NoPageActionHandler = (params: Record<string, unknown>, tabId?: number) => Promise<unknown>;

// Actions that don't need a Page instance
const noPageActions: Record<string, NoPageActionHandler> = {
  ...overlayHandlers,
  ...tabHandlers,
};

// Actions that require a Page instance
const pageActions: Record<string, ActionHandler> = {
  ...navigationHandlers,
  ...interactionHandlers,
  ...mouseHandlers,
  ...infoHandlers,
  ...domHandlers,
  ...networkHandlers,
  ...waitHandlers,
  ...dialogHandlers,
  ...consoleHandlers,
  ...downloadHandlers,
  ...cookieHandlers,
};

export async function executeAction(
  action: string,
  params: Record<string, unknown>,
  tabId?: number
): Promise<unknown> {
  if (action in noPageActions) {
    return noPageActions[action](params, tabId);
  }

  const page = tabId
    ? await browserContext.getPage(tabId)
    : await browserContext.getActivePage();

  if (!(action in pageActions)) {
    throw new BrowserAgentError(`Unknown action: ${action}`, 'CDP_ERROR');
  }

  return pageActions[action]({ page, params, tabId });
}
