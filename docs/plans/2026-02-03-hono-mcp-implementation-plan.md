# Hono MCP Server 重构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有的 MCP Server 从 stdio + Unix Socket + ws 架构重构为单一的 Hono HTTP 服务器

**Architecture:** 使用 Hono 提供 `/mcp` (StreamableHTTPTransport) 和 `/ws` (WebSocket) 双端点，BridgeStore 内存协调请求

**Tech Stack:** Bun, Hono, @modelcontextprotocol/sdk, TypeScript

---

## 前置准备

**参考文档：**
- 设计文档：`docs/plans/2026-02-03-hono-mcp-refactor-design.md`
- 现有代码：`mcp-server/src/mcp.ts` (1270 lines, 35+ tools)
- 现有代码：`mcp-server/src/daemon.ts` (527 lines, WebSocket server)

---

## Task 1: 更新 package.json 依赖

**Files:**
- Modify: `mcp-server/package.json`

**Step 1: 添加 Hono 依赖**

```bash
cd mcp-server
bun add hono
```

**Step 2: 移除 ws 依赖**

```bash
bun remove ws @types/ws
```

**Step 3: 验证 package.json**

Expected dependencies:
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "hono": "^4.x.x"
  }
}
```

**Step 4: Commit**

```bash
git add mcp-server/package.json mcp-server/bun.lockb
git commit -m "deps: add hono, remove ws"
```

---

## Task 2: 创建 Bridge 类型定义

**Files:**
- Create: `mcp-server/src/bridge/types.ts`

**Step 1: 创建类型文件**

```typescript
// mcp-server/src/bridge/types.ts

export type BridgeState =
  | { status: 'idle' }
  | { status: 'ready' }
  | { status: 'busy'; requestId: string };

export interface BridgeRequest {
  id: string;
  type: 'REQUEST' | 'PING';
  payload: unknown;
  timestamp: number;
}

export interface BridgeResponse {
  id: string;
  type: 'RESPONSE' | 'ERROR';
  payload?: unknown;
  error?: string;
}

// Messages from extension
export type ExtMessage =
  | { type: 'HELLO'; version: string }
  | { type: 'RESPONSE'; id: string; result: unknown }
  | { type: 'ERROR'; id: string; error: string }
  | { type: 'STATUS'; connected: boolean };

// Messages to extension
export type ServerMessage =
  | { type: 'REQUEST'; id: string; payload: unknown }
  | { type: 'PING' };

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}
```

**Step 2: Commit**

```bash
git add mcp-server/src/bridge/types.ts
git commit -m "feat(bridge): add type definitions"
```

---

## Task 3: 实现 BridgeStore

**Files:**
- Create: `mcp-server/src/bridge/store.ts`

**Step 1: 创建 BridgeStore 类**

```typescript
// mcp-server/src/bridge/store.ts

import type { BridgeState, PendingRequest, ServerMessage } from './types.js';

export class BridgeStore {
  private state: BridgeState = { status: 'idle' };
  private pendingRequests = new Map<string, PendingRequest>();
  private extensionWs: WebSocket | null = null;
  private requestIdCounter = 0;

  private readonly REQUEST_TIMEOUT = 60000; // 60 seconds

  getState(): BridgeState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state.status !== 'idle' && this.extensionWs !== null;
  }

  isReady(): boolean {
    return this.state.status === 'ready';
  }

  setExtension(ws: WebSocket): void {
    this.extensionWs = ws;
    this.state = { status: 'ready' };
  }

  removeExtension(ws: WebSocket): void {
    if (this.extensionWs === ws) {
      this.extensionWs = null;
      this.state = { status: 'idle' };

      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Extension disconnected'));
      }
      this.pendingRequests.clear();
    }
  }

  private nextRequestId(): string {
    return `req_${++this.requestIdCounter}_${Date.now()}`;
  }

  async sendRequest(payload: unknown): Promise<unknown> {
    if (this.state.status === 'idle') {
      throw new Error('Browser extension not connected');
    }

    if (this.state.status === 'busy') {
      throw new Error('Browser busy processing another request');
    }

    if (!this.extensionWs) {
      throw new Error('Browser extension not connected');
    }

    const id = this.nextRequestId();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.state = { status: 'ready' };
        reject(new Error('Request timeout'));
      }, this.REQUEST_TIMEOUT);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.state = { status: 'busy', requestId: id };

      const message: ServerMessage = {
        type: 'REQUEST',
        id,
        payload,
      };

      this.extensionWs!.send(JSON.stringify(message));
    });
  }

  resolveResponse(id: string, result: unknown): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      this.state = { status: 'ready' };
      pending.resolve(result);
    }
  }

  rejectResponse(id: string, error: string): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      this.state = { status: 'ready' };
      pending.reject(new Error(error));
    }
  }
}

export const bridgeStore = new BridgeStore();
```

**Step 2: Commit**

```bash
git add mcp-server/src/bridge/store.ts
git commit -m "feat(bridge): implement BridgeStore for request coordination"
```

---

## Task 4: 实现 WebSocket Handler

**Files:**
- Create: `mcp-server/src/ws/handler.ts`

**Step 1: 创建 WebSocket handler**

```typescript
// mcp-server/src/ws/handler.ts

import type { Context } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { bridgeStore } from '../bridge/store.js';
import type { ExtMessage } from '../bridge/types.js';

export const wsHandler = upgradeWebSocket((c: Context) => {
  return {
    onOpen: (event, ws) => {
      console.error('[WS] Extension connection attempt');

      // Only accept one extension connection
      if (bridgeStore.isConnected()) {
        console.error('[WS] Extension already connected, rejecting new connection');
        ws.close(1000, 'Another extension is already connected');
        return;
      }

      console.error('[WS] Extension connection established');
    },

    onMessage: (event, ws) => {
      try {
        const message = JSON.parse(event.data as string) as ExtMessage;

        // Handle HELLO message (handshake)
        if (message.type === 'HELLO') {
          console.error(`[WS] Extension handshake completed, version: ${message.version}`);
          bridgeStore.setExtension(ws);
          return;
        }

        // Handle RESPONSE from extension
        if (message.type === 'RESPONSE') {
          bridgeStore.resolveResponse(message.id, message.result);
          return;
        }

        // Handle ERROR from extension
        if (message.type === 'ERROR') {
          bridgeStore.rejectResponse(message.id, message.error);
          return;
        }

        // Handle STATUS update
        if (message.type === 'STATUS') {
          console.error(`[WS] Extension status update: connected=${message.connected}`);
          return;
        }
      } catch (error) {
        console.error('[WS] Failed to parse extension message:', error);
      }
    },

    onClose: (event, ws) => {
      console.error('[WS] Extension disconnected');
      bridgeStore.removeExtension(ws);
    },

    onError: (event, ws) => {
      console.error('[WS] WebSocket error:', event);
    },
  };
});
```

**Step 2: Commit**

```bash
git add mcp-server/src/ws/handler.ts
git commit -m "feat(ws): implement WebSocket handler for extension"
```

---

## Task 5: 创建工具定义文件

**Files:**
- Create: `mcp-server/src/mcp/tools/navigation.ts`
- Create: `mcp-server/src/mcp/tools/info.ts`
- Create: `mcp-server/src/mcp/tools/tabs.ts`
- Create: `mcp-server/src/mcp/tools/network.ts`
- Create: `mcp-server/src/mcp/tools/waiting.ts`
- Create: `mcp-server/src/mcp/tools/interaction.ts`
- Create: `mcp-server/src/mcp/tools/advanced.ts`
- Create: `mcp-server/src/mcp/tools/index.ts`

**Step 1: 创建 navigation.ts**

```typescript
// mcp-server/src/mcp/tools/navigation.ts

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const navigationTools: Tool[] = [
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL in the browser.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_click',
    description: 'Click on an element using index, CSS selector, or coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Element index from browser_get_dom_tree output' },
        selector: { type: 'string', description: 'CSS selector of the element' },
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
      },
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an element.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to type' },
        index: { type: 'number', description: 'Element index' },
        selector: { type: 'string', description: 'CSS selector' },
        clearFirst: { type: 'boolean', description: 'Clear before typing' },
      },
      required: ['text'],
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        distance: { type: 'number' },
        selector: { type: 'string', description: 'Element to scroll into view' },
      },
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to press (e.g., "Enter", "Escape")' },
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_go_back',
    description: 'Navigate back in browser history',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_go_forward',
    description: 'Navigate forward in browser history',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_reload',
    description: 'Reload the current page',
    inputSchema: { type: 'object', properties: {} },
  },
];
```

**Step 2: 创建 info.ts**

```typescript
// mcp-server/src/mcp/tools/info.ts

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const infoTools: Tool[] = [
  {
    name: 'browser_get_connection_status',
    description: 'Check if the browser extension is connected.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_lock',
    description: 'Lock the browser page to prevent user interaction.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Status message to display' },
      },
    },
  },
  {
    name: 'browser_unlock',
    description: 'Unlock the browser page.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_update_status',
    description: 'Update the status message on the lock overlay.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        shimmer: { type: 'boolean' },
      },
      required: ['status'],
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page.',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean' },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp'] },
      },
    },
  },
  {
    name: 'browser_extract',
    description: 'Extract text and HTML from an element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_evaluate',
    description: 'Execute JavaScript in the page context.',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string' },
      },
      required: ['script'],
    },
  },
  {
    name: 'browser_get_page_info',
    description: 'Get page URL and title.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_get_dom_tree',
    description: 'Get compact DOM tree of interactive elements.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        maxDepth: { type: 'number' },
        excludeTags: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'browser_get_dom_tree_full',
    description: 'Get full DOM tree with all attributes.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
      },
    },
  },
];
```

**Step 3: 创建 tabs.ts**

```typescript
// mcp-server/src/mcp/tools/tabs.ts

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const tabTools: Tool[] = [
  {
    name: 'browser_get_tabs',
    description: 'Get list of all open browser tabs.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_switch_tab',
    description: 'Switch to a specific browser tab.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'browser_blur',
    description: 'Remove focus from the current element.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number' },
        selector: { type: 'string' },
      },
    },
  },
  {
    name: 'browser_select_option',
    description: 'Select an option from a dropdown.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        value: { type: 'string' },
        text: { type: 'string' },
        index: { type: 'number' },
      },
      required: ['selector'],
    },
  },
];
```

**Step 4: 创建 network.ts**

```typescript
// mcp-server/src/mcp/tools/network.ts

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const networkTools: Tool[] = [
  {
    name: 'browser_enable_network',
    description: 'Enable network request capturing.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_disable_network',
    description: 'Disable network request capturing.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_get_network_requests',
    description: 'Get captured network requests (headers only).',
    inputSchema: {
      type: 'object',
      properties: {
        urlPattern: { type: 'string' },
        method: { type: 'string' },
        statusCode: { type: 'number' },
        resourceType: { type: 'string' },
        clear: { type: 'boolean' },
      },
    },
  },
  {
    name: 'browser_clear_network_requests',
    description: 'Clear all captured network requests.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_get_network_requests_with_response',
    description: 'Get network requests with response bodies.',
    inputSchema: {
      type: 'object',
      properties: {
        urlPattern: { type: 'string' },
        method: { type: 'string' },
        statusCode: { type: 'number' },
        resourceType: { type: 'string' },
        clear: { type: 'boolean' },
      },
    },
  },
  {
    name: 'browser_wait_for_response',
    description: 'Wait for a network response matching URL pattern.',
    inputSchema: {
      type: 'object',
      properties: {
        urlPattern: { type: 'string' },
        method: { type: 'string' },
        timeout: { type: 'number' },
      },
      required: ['urlPattern'],
    },
  },
];
```

**Step 5: 创建 waiting.ts**

```typescript
// mcp-server/src/mcp/tools/waiting.ts

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const waitingTools: Tool[] = [
  {
    name: 'browser_wait_for_selector',
    description: 'Wait for an element to appear in the DOM.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        visible: { type: 'boolean' },
        hidden: { type: 'boolean' },
        timeout: { type: 'number' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_wait_for_timeout',
    description: 'Wait for a specified time.',
    inputSchema: {
      type: 'object',
      properties: {
        ms: { type: 'number' },
      },
      required: ['ms'],
    },
  },
  {
    name: 'browser_wait_for_load_state',
    description: 'Wait for page to reach a load state.',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'] },
        timeout: { type: 'number' },
      },
    },
  },
  {
    name: 'browser_wait_for_function',
    description: 'Wait for a JavaScript function to return truthy.',
    inputSchema: {
      type: 'object',
      properties: {
        function: { type: 'string' },
        timeout: { type: 'number' },
        polling: { type: 'number' },
      },
      required: ['function'],
    },
  },
];
```

**Step 6: 创建 interaction.ts**

```typescript
// mcp-server/src/mcp/tools/interaction.ts

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const interactionTools: Tool[] = [
  {
    name: 'browser_upload_file',
    description: 'Upload files to a file input element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
      },
      required: ['selector', 'files'],
    },
  },
  {
    name: 'browser_get_dialog',
    description: 'Get information about the current JavaScript dialog.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_handle_dialog',
    description: 'Handle a JavaScript dialog.',
    inputSchema: {
      type: 'object',
      properties: {
        accept: { type: 'boolean' },
        promptText: { type: 'string' },
      },
    },
  },
  {
    name: 'browser_set_auto_dialog',
    description: 'Set automatic handling for all JavaScript dialogs.',
    inputSchema: {
      type: 'object',
      properties: {
        handler: { type: 'string', enum: ['accept', 'dismiss', 'null'] },
      },
    },
  },
  {
    name: 'browser_get_console_logs',
    description: 'Get console logs from the page.',
    inputSchema: {
      type: 'object',
      properties: {
        types: {
          type: 'array',
          items: { type: 'string', enum: ['log', 'info', 'warn', 'error', 'debug'] },
        },
      },
    },
  },
  {
    name: 'browser_enable_console_capture',
    description: 'Enable capturing of console logs.',
    inputSchema: { type: 'object', properties: {} },
  },
];
```

**Step 7: 创建 advanced.ts**

```typescript
// mcp-server/src/mcp/tools/advanced.ts

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const advancedTools: Tool[] = [
  {
    name: 'browser_hover',
    description: 'Hover over an element to trigger hover effects.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_double_click',
    description: 'Double-click on an element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_right_click',
    description: 'Right-click on an element to open context menu.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_download',
    description: 'Download a page resource to local.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        index: { type: 'number' },
        selector: { type: 'string' },
      },
    },
  },
];
```

**Step 8: 创建 index.ts**

```typescript
// mcp-server/src/mcp/tools/index.ts

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { navigationTools } from './navigation.js';
import { infoTools } from './info.js';
import { tabTools } from './tabs.js';
import { networkTools } from './network.js';
import { waitingTools } from './waiting.js';
import { interactionTools } from './interaction.js';
import { advancedTools } from './advanced.js';

export const allTools: Tool[] = [
  ...navigationTools,
  ...infoTools,
  ...tabTools,
  ...networkTools,
  ...waitingTools,
  ...interactionTools,
  ...advancedTools,
];

// Tool name to action mapping
export function getActionFromToolName(toolName: string): string {
  const mapping: Record<string, string> = {
    browser_lock: 'lock',
    browser_unlock: 'unlock',
    browser_update_status: 'update_status',
    browser_navigate: 'navigate',
    browser_click: 'click',
    browser_type: 'type',
    browser_scroll: 'scroll',
    browser_screenshot: 'screenshot',
    browser_extract: 'extract',
    browser_evaluate: 'evaluate',
    browser_get_page_info: 'get_page_info',
    browser_get_dom_tree: 'get_dom_tree',
    browser_get_dom_tree_full: 'get_dom_tree_full',
    browser_get_tabs: 'get_tabs',
    browser_switch_tab: 'switch_tab',
    browser_press_key: 'press_key',
    browser_blur: 'blur',
    browser_select_option: 'select_option',
    browser_go_back: 'go_back',
    browser_go_forward: 'go_forward',
    browser_reload: 'reload',
    browser_enable_network: 'enable_network',
    browser_disable_network: 'disable_network',
    browser_get_network_requests: 'get_network_requests',
    browser_get_network_requests_with_response: 'get_network_requests_with_response',
    browser_clear_network_requests: 'clear_network_requests',
    browser_wait_for_response: 'wait_for_response',
    browser_wait_for_selector: 'wait_for_selector',
    browser_wait_for_timeout: 'wait_for_timeout',
    browser_wait_for_load_state: 'wait_for_load_state',
    browser_wait_for_function: 'wait_for_function',
    browser_upload_file: 'upload_file',
    browser_get_dialog: 'get_dialog',
    browser_handle_dialog: 'handle_dialog',
    browser_set_auto_dialog: 'set_auto_dialog',
    browser_get_console_logs: 'get_console_logs',
    browser_enable_console_capture: 'enable_console_capture',
    browser_hover: 'hover',
    browser_double_click: 'double_click',
    browser_right_click: 'right_click',
    browser_download: 'download',
    browser_get_connection_status: 'get_connection_status',
  };
  return mapping[toolName] || toolName;
}
```

**Step 9: Commit**

```bash
git add mcp-server/src/mcp/tools/
git commit -m "feat(mcp): add all 35+ tool definitions"
```

---

## Task 6: 实现 MCP Server 和 Handler

**Files:**
- Create: `mcp-server/src/mcp/server.ts`
- Create: `mcp-server/src/mcp/handler.ts`

**Step 1: 创建 server.ts**

```typescript
// mcp-server/src/mcp/server.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { allTools, getActionFromToolName } from './tools/index.js';
import { bridgeStore } from '../bridge/store.js';

export function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'browser-agent',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Special handling for connection status
    if (name === 'browser_get_connection_status') {
      const isConnected = bridgeStore.isConnected();
      const isReady = bridgeStore.isReady();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                connected: isConnected,
                ready: isReady,
                message: isConnected
                  ? isReady
                    ? 'Browser extension is connected and ready.'
                    : 'Browser extension is connected but busy.'
                  : 'Browser extension is not connected. Please open the Browser Agent extension side panel.',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    try {
      const action = getActionFromToolName(name);
      const result = await bridgeStore.sendRequest({
        action,
        params: args,
      });

      // Special handling for screenshot
      if (name === 'browser_screenshot' && result && typeof result === 'object') {
        const screenshotResult = result as { image?: string; width?: number; height?: number };
        if (screenshotResult.image) {
          return {
            content: [
              {
                type: 'image',
                data: screenshotResult.image,
                mimeType: 'image/png',
              },
              {
                type: 'text',
                text: `Screenshot captured: ${screenshotResult.width}x${screenshotResult.height}`,
              },
            ],
          };
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
```

**Step 2: 创建 handler.ts**

```typescript
// mcp-server/src/mcp/handler.ts

import type { Context } from 'hono';
import { StreamableHTTPTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';

// Create server and transport once
const mcpServer = createMcpServer();
const transport = new StreamableHTTPTransport('/mcp');

// Connect server to transport
await mcpServer.connect(transport);

export async function mcpHandler(c: Context): Promise<Response> {
  // Handle the request using the transport
  return transport.handleRequest(c.req.raw);
}
```

**Step 3: Commit**

```bash
git add mcp-server/src/mcp/server.ts mcp-server/src/mcp/handler.ts
git commit -m "feat(mcp): implement MCP server with StreamableHTTPTransport"
```

---

## Task 7: 实现主入口文件

**Files:**
- Create: `mcp-server/src/main.ts` (替换原有文件)

**Step 1: 创建新的 main.ts**

```typescript
#!/usr/bin/env node
// mcp-server/src/main.ts

/**
 * Browser Agent MCP Server with Hono
 *
 * Provides:
 * - /mcp - MCP Streamable HTTP endpoint
 * - /ws - WebSocket endpoint for browser extension
 * - /health - Health check endpoint
 */

import { Hono } from 'hono';
import { websocket } from 'hono/bun';
import { mcpHandler } from './mcp/handler.js';
import { wsHandler } from './ws/handler.js';
import { bridgeStore } from './bridge/store.js';

const app = new Hono();

// MCP Streamable HTTP endpoint
app.all('/mcp', mcpHandler);

// WebSocket endpoint for browser extension
app.get('/ws', wsHandler);

// Health check
app.get('/health', (c) => {
  const state = bridgeStore.getState();
  return c.json({
    status: 'ok',
    extensionConnected: bridgeStore.isConnected(),
    state: state.status,
  });
});

// Default port
const PORT = parseInt(process.env.PORT || '3026');

console.error(`[Server] Starting Browser Agent MCP Server...`);
console.error(`[Server] MCP endpoint: http://localhost:${PORT}/mcp`);
console.error(`[Server] WebSocket endpoint: ws://localhost:${PORT}/ws`);
console.error(`[Server] Health check: http://localhost:${PORT}/health`);

// Export for Bun
export default {
  fetch: app.fetch,
  websocket,
  port: PORT,
};
```

**Step 2: Commit**

```bash
git add mcp-server/src/main.ts
git commit -m "feat(main): implement Hono server with MCP and WebSocket endpoints"
```

---

## Task 8: 更新 tsconfig.json (如有需要)

**Files:**
- Check: `mcp-server/tsconfig.json`

**Step 1: 验证 tsconfig.json 支持顶级 await**

确保 `target` 是 `ES2022` 或更高：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

如果已经正确，跳过此任务。

---

## Task 9: 测试服务器启动

**Files:**
- Run: `mcp-server/src/main.ts`

**Step 1: 运行服务器**

```bash
cd mcp-server
bun src/main.ts
```

**Expected output:**
```
[Server] Starting Browser Agent MCP Server...
[Server] MCP endpoint: http://localhost:3026/mcp
[Server] WebSocket endpoint: ws://localhost:3026/ws
[Server] Health check: http://localhost:3026/health
```

**Step 2: 测试健康检查**

在另一个终端：

```bash
curl http://localhost:3026/health
```

**Expected:**
```json
{"status":"ok","extensionConnected":false,"state":"idle"}
```

**Step 3: Commit (如果测试通过)**

```bash
git commit --allow-empty -m "test: verify server starts correctly"
```

---

## Task 10: 删除旧文件

**Files:**
- Delete: `mcp-server/src/daemon.ts`
- Delete: `mcp-server/src/mcp.ts`
- Delete: `mcp-server/src/entrypoint.ts` (如果不再需要)
- Delete: `mcp-server/src/logging.ts` (如果不再需要)

**Step 1: 删除旧文件**

```bash
cd mcp-server/src
rm daemon.ts mcp.ts entrypoint.ts logging.ts
```

**Step 2: 更新 main.ts 引用 (如果需要)**

检查是否还有其他文件引用这些旧文件。

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove old daemon and mcp files"
```

---

## Task 11: 更新测试文件

**Files:**
- Check: `mcp-server/tests/` 目录

**Step 1: 检查现有测试**

```bash
ls -la mcp-server/tests/
```

**Step 2: 更新或删除不兼容的测试**

旧测试可能依赖 `daemon.ts` 和 `mcp.ts`，需要更新或删除。

**Step 3: 运行测试**

```bash
cd mcp-server
bun test
```

**Step 4: Commit**

```bash
git add -A
git commit -m "test: update tests for Hono architecture"
```

---

## Task 12: 最终验证

**Step 1: 完整构建测试**

```bash
cd mcp-server
bun run build
```

**Step 2: 类型检查**

```bash
bun run build:types
```

**Step 3: 最终 Commit**

```bash
git commit --allow-empty -m "feat: complete Hono MCP Server refactor"
```

---

## 注意事项

1. **扩展兼容性**：浏览器扩展的 WebSocket 客户端需要更新连接地址到 `ws://localhost:3026/ws`

2. **MCP 客户端配置**：Claude Code 或其他 MCP 客户端需要配置为使用 HTTP transport 连接到 `http://localhost:3026/mcp`

3. **环境变量**：
   - `PORT` - 服务器端口 (默认 3026)
   - 移除了 `BROWSER_AGENT_DAEMON_SOCKET` 等旧变量

4. **进程管理**：
   - 不再需要 daemon 模式，服务器直接运行
   - 可以使用 `nohup` 或 `systemd` 后台运行
