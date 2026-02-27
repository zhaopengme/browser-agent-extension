/**
 * Service Worker entry point
 * Handles extension initialization and MCP request routing
 */

import { browserContext } from '@/cdp';
import { executeAction } from './router';

interface MCPRequest {
  type: 'MCP_REQUEST';
  id: string;
  action: string;
  params?: Record<string, unknown>;
  tabId?: number;
}

interface MCPResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

async function initialize(): Promise<void> {
  console.log('[Background] Browser Agent Extension initializing...');

  chrome.action.onClicked.addListener((tab) => {
    if (tab.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'MCP_REQUEST') {
      handleMCPRequest(message as MCPRequest)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      return true;
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    browserContext.removeClosedTab(tabId);
  });

  console.log('[Background] Extension initialized');
}

async function handleMCPRequest(request: MCPRequest): Promise<MCPResponse> {
  const { action, params, tabId } = request;
  console.log(`[Background] MCP Request: ${action}`, JSON.stringify(params), tabId ? `(tab: ${tabId})` : '');

  try {
    const result = await executeAction(action, params || {}, tabId);
    return { success: true, data: result };
  } catch (error) {
    console.error(`[Background] Action error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

initialize().catch(console.error);
