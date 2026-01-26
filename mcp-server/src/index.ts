#!/usr/bin/env node
/**
 * Browser Agent MCP Server
 *
 * 通过 stdio 与 AI 客户端通信 (MCP 协议)
 * 通过 Daemon 与浏览器扩展通信 (支持多客户端会话)
 * 如果 Daemon 不可用，回退到直接 WebSocket 连接
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, WebSocket } from 'ws';
import * as net from 'net';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WS_PORT = process.env.BROWSER_AGENT_WS_PORT ? parseInt(process.env.BROWSER_AGENT_WS_PORT) : 3026;
const HEARTBEAT_INTERVAL = 30000; // 30秒心跳间隔
const HEARTBEAT_TIMEOUT = 10000;  // 10秒心跳超时
const DAEMON_SOCKET_PATH = '/tmp/browser-agent-daemon.sock';
const DAEMON_STARTUP_TIMEOUT = 5000; // 5秒等待 daemon 启动
const DAEMON_LOCK_PATH = '/tmp/browser-agent-daemon.lock';

// Daemon 模式状态
let useDaemon = false;
let daemonSocket: net.Socket | null = null;
let sessionId: string | null = null;
let daemonBuffer = '';

// 存储当前连接的扩展客户端（回退模式）
let extensionClient: WebSocket | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let wssInstance: WebSocketServer | null = null;

// 请求ID计数器
let requestIdCounter = 0;

// 等待响应的 Promise 映射
const pendingRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
}>();

/**
 * 清理所有待处理的请求（连接断开时调用）
 */
function clearPendingRequests(reason: string): void {
  for (const [id, pending] of pendingRequests) {
    clearTimeout(pending.timeout);
    pending.reject(new Error(`Request cancelled: ${reason}`));
  }
  pendingRequests.clear();
}

// ========== Daemon 相关函数 ==========

/**
 * 检查 daemon socket 是否存在且可连接
 */
async function isDaemonRunning(): Promise<boolean> {
  if (!fs.existsSync(DAEMON_SOCKET_PATH)) {
    return false;
  }

  return new Promise((resolve) => {
    const testSocket = net.createConnection(DAEMON_SOCKET_PATH);

    testSocket.on('connect', () => {
      testSocket.end();
      resolve(true);
    });

    testSocket.on('error', () => {
      resolve(false);
    });

    setTimeout(() => {
      testSocket.destroy();
      resolve(false);
    }, 1000);
  });
}

/**
 * 获取 daemon 启动锁
 */
async function acquireDaemonLock(): Promise<boolean> {
  try {
    const fd = fs.openSync(DAEMON_LOCK_PATH, 'wx');
    fs.writeSync(fd, process.pid.toString());
    fs.closeSync(fd);
    return true;
  } catch (error: any) {
    if (error.code === 'EEXIST') {
      return false; // Another process is spawning daemon
    }
    throw error;
  }
}

/**
 * 释放 daemon 启动锁
 */
function releaseDaemonLock(): void {
  try {
    fs.unlinkSync(DAEMON_LOCK_PATH);
  } catch {
    // Ignore errors
  }
}

/**
 * 启动 daemon 进程
 */
function spawnDaemon(): void {
  const daemonPath = path.join(__dirname, 'daemon.js');

  if (!fs.existsSync(daemonPath)) {
    console.error(`[MCP Server] Daemon script not found at ${daemonPath}`);
    return;
  }

  console.error('[MCP Server] Spawning daemon process...');

  const child = spawn('node', [daemonPath], {
    detached: true,
    stdio: 'ignore'
  });

  child.unref();
  console.error(`[MCP Server] Daemon spawned with PID ${child.pid}`);
}

/**
 * 等待 daemon 启动完成
 */
async function waitForDaemon(): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < DAEMON_STARTUP_TIMEOUT) {
    if (await isDaemonRunning()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return false;
}

/**
 * 连接到 daemon
 */
async function connectToDaemon(): Promise<boolean> {
  try {
    // 检查 daemon 是否运行
    if (!(await isDaemonRunning())) {
      console.error('[MCP Server] Daemon not running, attempting to spawn...');

      if (await acquireDaemonLock()) {
        try {
          spawnDaemon();

          // 等待 daemon 启动
          if (!(await waitForDaemon())) {
            console.error('[MCP Server] Daemon failed to start within timeout');
            releaseDaemonLock();
            return false;
          }

          // Release lock after daemon is running
          releaseDaemonLock();
        } catch (error) {
          releaseDaemonLock();
          throw error;
        }
      } else {
        console.error('[MCP Server] Another process is spawning daemon, waiting...');
        if (!(await waitForDaemon())) {
          console.error('[MCP Server] Daemon failed to start');
          return false;
        }
      }
    }

    // 连接到 daemon
    daemonSocket = net.createConnection(DAEMON_SOCKET_PATH);

    return new Promise((resolve) => {
      let resolved = false;

      daemonSocket!.on('connect', () => {
        console.error('[MCP Server] Connected to daemon');

        // 发送 REGISTER 消息
        const registerId = `reg_${++requestIdCounter}`;
        sendToDaemon({
          type: 'REGISTER',
          id: registerId,
        });
      });

      daemonSocket!.on('data', (data) => {
        daemonBuffer += data.toString();

        // 处理完整消息（换行符分隔）
        let newlineIndex: number;
        while ((newlineIndex = daemonBuffer.indexOf('\n')) !== -1) {
          const line = daemonBuffer.slice(0, newlineIndex);
          daemonBuffer = daemonBuffer.slice(newlineIndex + 1);

          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              handleDaemonMessage(message);

              // 处理 REGISTER_OK 响应
              if (message.type === 'REGISTER_OK' && !resolved) {
                sessionId = message.sessionId;
                console.error(`[MCP Server] Session registered: ${sessionId}`);
                resolved = true;
                resolve(true);
              }
            } catch (error) {
              console.error('[MCP Server] Failed to parse daemon message:', error);
            }
          }
        }
      });

      daemonSocket!.on('close', () => {
        console.error('[MCP Server] Daemon connection closed');
        daemonSocket = null;
        sessionId = null;
        useDaemon = false;
        clearPendingRequests('Daemon connection closed');

        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      daemonSocket!.on('error', (error) => {
        console.error('[MCP Server] Daemon connection error:', error);
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      // 超时处理
      setTimeout(() => {
        if (!resolved) {
          console.error('[MCP Server] Daemon registration timeout');
          if (daemonSocket) {
            daemonSocket.destroy();
          }
          resolved = true;
          resolve(false);
        }
      }, 5000);
    });
  } catch (error) {
    console.error('[MCP Server] Failed to connect to daemon:', error);
    return false;
  }
}

/**
 * 发送消息到 daemon
 */
function sendToDaemon(message: object): void {
  if (!daemonSocket) {
    throw new Error('Daemon not connected');
  }
  daemonSocket.write(JSON.stringify(message) + '\n');
}

/**
 * 处理来自 daemon 的消息
 */
function handleDaemonMessage(message: any): void {
  if (message.type === 'RESPONSE') {
    const pending = pendingRequests.get(message.id);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingRequests.delete(message.id);

      if (message.payload.success) {
        pending.resolve(message.payload.data);
      } else {
        pending.reject(new Error(message.payload.error || 'Unknown error'));
      }
    }
  }
}

/**
 * 通过 daemon 发送请求
 */
async function sendViaDaemon(action: string, params?: Record<string, unknown>): Promise<unknown> {
  if (!daemonSocket || !sessionId) {
    throw new Error('Daemon not connected or session not registered');
  }

  const id = `req_${++requestIdCounter}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request timeout: ${action}`));
    }, 30000); // 30秒超时

    pendingRequests.set(id, { resolve, reject, timeout });

    sendToDaemon({
      type: 'REQUEST',
      id,
      sessionId,
      action,
      params,
    });
  });
}

/**
 * 断开 daemon 连接
 */
function disconnectFromDaemon(): void {
  if (daemonSocket && sessionId) {
    try {
      sendToDaemon({
        type: 'DISCONNECT',
        id: `disc_${++requestIdCounter}`,
        sessionId,
      });
    } catch (error) {
      console.error('[MCP Server] Failed to send DISCONNECT:', error);
    }
  }

  if (daemonSocket) {
    daemonSocket.end();
    daemonSocket = null;
  }

  sessionId = null;
  useDaemon = false;
}

// ========== 回退模式：直接 WebSocket 连接 ==========

/**
 * 启动心跳检测
 */
function startHeartbeat(ws: WebSocket): void {
  stopHeartbeat();

  heartbeatTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();

      // 设置超时检测
      const pongTimeout = setTimeout(() => {
        console.error('[MCP Server] Heartbeat timeout, closing connection');
        ws.terminate();
      }, HEARTBEAT_TIMEOUT);

      ws.once('pong', () => {
        clearTimeout(pongTimeout);
      });
    }
  }, HEARTBEAT_INTERVAL);
}

/**
 * 停止心跳检测
 */
function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * 发送请求到浏览器扩展（自动选择 daemon 或直接连接）
 */
async function sendToExtension(action: string, params?: Record<string, unknown>): Promise<unknown> {
  // 优先使用 daemon
  if (useDaemon && daemonSocket && sessionId) {
    try {
      return await sendViaDaemon(action, params);
    } catch (error) {
      console.error('[MCP Server] Daemon request failed, falling back to direct connection:', error);
      // 如果 daemon 失败，尝试回退到直接连接
      useDaemon = false;
    }
  }

  // 回退到直接 WebSocket 连接
  if (!extensionClient || extensionClient.readyState !== WebSocket.OPEN) {
    throw new Error(
      'Browser extension not connected. ' +
      'Please ask the user to: 1) Open Chrome browser, 2) Click the Browser Agent extension icon, 3) Open the Side Panel. ' +
      'You can use browser_get_connection_status to check connection state.'
    );
  }

  const id = `req_${++requestIdCounter}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request timeout: ${action}`));
    }, 30000); // 30秒超时

    pendingRequests.set(id, { resolve, reject, timeout });

    const request = {
      type: 'REQUEST',
      id,
      action,
      params,
    };

    extensionClient!.send(JSON.stringify(request));
  });
}

/**
 * 定义 MCP 工具
 */
const TOOLS: Tool[] = [
  // ========== 连接状态 ==========
  {
    name: 'browser_get_connection_status',
    description: `Check if the browser extension is connected to the MCP server.

Use this tool FIRST before performing any browser operations to verify the extension is ready.
If not connected, inform the user to open the browser extension side panel.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ========== 页面控制锁定 ==========
  {
    name: 'browser_lock',
    description: `Lock the browser page to prevent user interaction during automation.

Use this when performing multi-step operations where user interference could cause issues.
Displays a visual overlay with a status message, blocking all user input.

Recommended workflow for complex automations:
1. browser_lock (with status message like "Automating...")
2. Perform your operations (navigate, click, type, etc.)
3. browser_unlock when done

For simple single operations (just reading page info, taking a screenshot), locking is optional.`,
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Status message to display on the overlay (e.g., "Automating form submission...")'
        },
      },
    },
  },
  {
    name: 'browser_unlock',
    description: `Unlock the browser page to restore user interaction after automation.

IMPORTANT: Always call this after completing your browser operations to allow the user to interact with the page again.

This hides the overlay and re-enables all user input.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_update_status',
    description: 'Update the status message on the lock overlay without unlocking. Useful for showing progress during multi-step operations.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'New status message to display' },
        shimmer: { type: 'boolean', description: 'Enable shimmer animation effect on the text' },
      },
      required: ['status'],
    },
  },

  // ========== 基础导航和交互 ==========
  {
    name: 'browser_navigate',
    description: `Navigate to a URL in the browser.

TIP: Consider calling browser_lock before navigation if you want to prevent user interference during a multi-step automation sequence.`,
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
    description: `Click on an element using index (recommended), CSS selector, or coordinates.

RECOMMENDED: Use 'index' parameter with the element index from browser_get_dom_tree output.
Example: After getting DOM tree showing "[5] button "Submit" @(100,200,80,32)", use index: 5 to click it.`,
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Element index from browser_get_dom_tree output (recommended)' },
        selector: { type: 'string', description: 'CSS selector of the element to click' },
        x: { type: 'number', description: 'X coordinate to click at' },
        y: { type: 'number', description: 'Y coordinate to click at' },
      },
    },
  },
  {
    name: 'browser_type',
    description: `Type text into an element using index (recommended), CSS selector, or the currently focused element.

RECOMMENDED: Use 'index' parameter with the element index from browser_get_dom_tree output.
Example: After getting DOM tree showing "[5] input placeholder="Search..." @(100,200,200,40)", use index: 5 to type into it.

For contenteditable elements (rich text editors like Vditor), always use index parameter.`,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to type' },
        index: { type: 'number', description: 'Element index from browser_get_dom_tree output (recommended for reliable input)' },
        selector: { type: 'string', description: 'CSS selector of the element to type into (optional)' },
        clearFirst: { type: 'boolean', description: 'Clear the element before typing' },
      },
      required: ['text'],
    },
  },
  {
    name: 'browser_scroll',
    description: `Scroll the page in a direction or to a specific element.

Usage modes:
- Direction scroll: Use 'direction' + optional 'distance' (default ~500px) to scroll the viewport
- Element scroll: Use 'selector' to scroll until the element is in view

Examples:
- { direction: "down", distance: 300 } - scroll down 300px
- { selector: "#footer" } - scroll to the footer element`,
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Direction to scroll' },
        distance: { type: 'number', description: 'Distance to scroll in pixels (default: ~500)' },
        selector: { type: 'string', description: 'CSS selector of element to scroll into view' },
      },
    },
  },
  {
    name: 'browser_screenshot',
    description: `Take a screenshot of the current page.

📷 SECONDARY OPTION: Use this when browser_get_dom_tree doesn't provide enough information (e.g., visual layout verification, seeing non-interactive content, debugging visual issues).

For most automation tasks, prefer browser_get_dom_tree as it's more token-efficient and provides structured data.`,
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean', description: 'Capture the full page or just the viewport' },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp'], description: 'Image format' },
      },
    },
  },
  {
    name: 'browser_extract',
    description: `Extract text and HTML content from an element.

Returns: { text: string, html: string, innerText: string }
- text: The textContent of the element
- html: The outerHTML of the element
- innerText: The rendered text (respects CSS visibility)`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to extract' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_evaluate',
    description: `Execute JavaScript code in the page context.

Returns the result of the expression. For complex return values, use JSON.stringify() in your script.

Examples:
- "document.title" - returns the page title
- "window.scrollY" - returns current scroll position
- "document.querySelectorAll('a').length" - returns link count

Note: The script runs in the page's context, so you have access to the page's DOM and JS variables.`,
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'JavaScript code to execute (expression or statement)' },
      },
      required: ['script'],
    },
  },
  {
    name: 'browser_get_page_info',
    description: 'Get information about the current page (URL, title)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_get_dom_tree',
    description: `Get a compact, token-efficient DOM tree of the current page.

⭐ RECOMMENDED: This is the PRIMARY tool for getting page information. Use this FIRST before considering browser_screenshot or browser_get_dom_tree_full.

Returns ONLY interactive elements (buttons, links, inputs, etc.) grouped by semantic regions.
Each element includes a bounding box for understanding layout.

Format: [index] tag [type=x] "text" → href (placeholder) @(x,y,width,height)

Example output:
# DOM Tree (12 interactive elements)

## header @(0,0,1200,64)
[0] a "Home" → / @(16,16,60,32)
[1] button "Menu" @(1100,16,80,32)

## main @(0,64,1200,800)
[2] input (Search...) @(100,100,400,40)
[3] button "Submit" @(520,100,80,40)
[4] a "Learn more" → /about @(100,200,100,24)

## aside @(900,64,300,800)
[5] a "Dashboard" → /dashboard @(920,100,260,40)

Use browser_click with 'index' parameter to interact with elements.
Example: browser_click({ index: 3 }) clicks the "Submit" button.`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to limit scope (e.g., "main", "#content", ".sidebar")'
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth to traverse (default: 15)'
        },
        excludeTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional tags to exclude (svg, script, style already excluded)'
        },
      },
    },
  },
  {
    name: 'browser_get_dom_tree_full',
    description: `Get the complete DOM tree in full JSON format.

⚠️ LAST RESORT: Only use this when browser_get_dom_tree AND browser_screenshot both fail to provide the needed information. This tool consumes significantly more tokens.

Returns a structured tree of visible DOM elements including:
- Element tag name, id, className
- Text content (truncated to 200 chars)
- Bounding rect (x, y, width, height)
- Important attributes (href, src, alt, title, placeholder, type, name, value, role, aria-label)

Priority order for getting page information:
1. browser_get_dom_tree (FIRST CHOICE - compact, token-efficient)
2. browser_screenshot (SECOND CHOICE - for visual verification)
3. browser_get_dom_tree_full (LAST RESORT - only when debugging or need full attribute data)`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Optional CSS selector to get DOM tree of a specific element. If not provided, returns the entire body.'
        },
      },
    },
  },
  {
    name: 'browser_get_tabs',
    description: `Get list of all open browser tabs.

Returns an array of tab objects with: { id, title, url, active, windowId }
Use the 'id' value with browser_switch_tab to switch to a specific tab.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_switch_tab',
    description: 'Switch to a specific browser tab',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'The ID of the tab to switch to' },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to press (e.g., "Enter", "Escape", "Tab")' },
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_blur',
    description: `Remove focus from the currently focused element.

Use this after typing into an input field to close any dropdown menus, autocomplete suggestions, or popups that appear when the element has focus.

Example workflow:
1. browser_click({ index: 5 }) - click on search input
2. browser_type({ text: "search query" }) - type text
3. browser_blur() - remove focus to close dropdown suggestions
4. Continue with other operations...`,
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Optional: Element index to blur. If not provided, blurs the currently focused element.' },
        selector: { type: 'string', description: 'Optional: CSS selector of element to blur. If not provided, blurs the currently focused element.' },
      },
    },
  },
  {
    name: 'browser_select_option',
    description: 'Select an option from a dropdown/select element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the select element' },
        value: { type: 'string', description: 'Value of the option to select' },
        text: { type: 'string', description: 'Text content of the option to select' },
        index: { type: 'number', description: 'Index of the option to select' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_go_back',
    description: 'Navigate back in browser history',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_go_forward',
    description: 'Navigate forward in browser history',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_reload',
    description: 'Reload the current page',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ========== 网络请求捕获 ==========
  {
    name: 'browser_enable_network',
    description: `Enable network request capturing to monitor XHR, Fetch, and other network requests.

IMPORTANT: You must call this BEFORE the requests you want to capture are made.
After enabling, use browser_get_network_requests or browser_get_network_requests_with_response to retrieve captured data.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_disable_network',
    description: 'Disable network request capturing',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_get_network_requests',
    description: `Get captured network requests (headers only, no response body).

Returns request metadata: URL, method, status, headers, timing.
For response body content, use browser_get_network_requests_with_response instead.

Requires: browser_enable_network must be called first.`,
    inputSchema: {
      type: 'object',
      properties: {
        urlPattern: { type: 'string', description: 'Regex pattern to filter requests by URL' },
        method: { type: 'string', description: 'HTTP method to filter (GET, POST, etc.)' },
        statusCode: { type: 'number', description: 'Status code to filter' },
        resourceType: { type: 'string', description: 'Resource type (XHR, Fetch, Document, etc.)' },
        clear: { type: 'boolean', description: 'Clear captured requests after returning' },
      },
    },
  },
  {
    name: 'browser_clear_network_requests',
    description: 'Clear all captured network requests',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_get_network_requests_with_response',
    description: `Get captured network requests WITH response body included.

Use this to inspect API responses, JSON data, or debug network issues.
Note: This is slower than browser_get_network_requests as it fetches each response body.

Requires: browser_enable_network must be called first.
TIP: Use urlPattern filter to limit results and improve performance.`,
    inputSchema: {
      type: 'object',
      properties: {
        urlPattern: { type: 'string', description: 'Regex pattern to filter requests by URL (recommended for performance)' },
        method: { type: 'string', description: 'HTTP method to filter (GET, POST, etc.)' },
        statusCode: { type: 'number', description: 'Status code to filter' },
        resourceType: { type: 'string', description: 'Resource type (XHR, Fetch, Document, etc.)' },
        clear: { type: 'boolean', description: 'Clear captured requests after returning' },
      },
    },
  },
  {
    name: 'browser_wait_for_response',
    description: `Wait for a network response matching the URL pattern.

Useful for waiting for API calls to complete after triggering an action (click, submit, etc.).
Returns the matched response data including body.

Requires: browser_enable_network must be called first.

Example: After clicking a submit button, wait for the API response:
  browser_wait_for_response({ urlPattern: "/api/submit", timeout: 10000 })`,
    inputSchema: {
      type: 'object',
      properties: {
        urlPattern: { type: 'string', description: 'Regex pattern to match request URL' },
        method: { type: 'string', description: 'HTTP method to match (optional)' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
      required: ['urlPattern'],
    },
  },

  // ========== 等待机制 ==========
  {
    name: 'browser_wait_for_selector',
    description: 'Wait for an element matching the selector to appear in the DOM',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to wait for' },
        visible: { type: 'boolean', description: 'Wait for element to be visible (default: true)' },
        hidden: { type: 'boolean', description: 'Wait for element to be hidden or removed' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_wait_for_timeout',
    description: 'Wait for a specified amount of time',
    inputSchema: {
      type: 'object',
      properties: {
        ms: { type: 'number', description: 'Time to wait in milliseconds' },
      },
      required: ['ms'],
    },
  },
  {
    name: 'browser_wait_for_load_state',
    description: 'Wait for the page to reach a specific load state',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['load', 'domcontentloaded', 'networkidle'],
          description: 'Load state to wait for'
        },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
    },
  },
  {
    name: 'browser_wait_for_function',
    description: 'Wait for a JavaScript function to return a truthy value',
    inputSchema: {
      type: 'object',
      properties: {
        function: { type: 'string', description: 'JavaScript function/expression to evaluate' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
        polling: { type: 'number', description: 'Polling interval in milliseconds (default: 100)' },
      },
      required: ['function'],
    },
  },

  // ========== 文件上传 ==========
  {
    name: 'browser_upload_file',
    description: 'Upload files to a file input element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the file input element' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of absolute file paths to upload'
        },
      },
      required: ['selector', 'files'],
    },
  },

  // ========== 弹窗处理 ==========
  {
    name: 'browser_get_dialog',
    description: 'Get information about the current JavaScript dialog (alert, confirm, prompt)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_handle_dialog',
    description: 'Handle a JavaScript dialog by accepting or dismissing it',
    inputSchema: {
      type: 'object',
      properties: {
        accept: { type: 'boolean', description: 'Whether to accept (true) or dismiss (false) the dialog' },
        promptText: { type: 'string', description: 'Text to enter for prompt dialogs' },
      },
    },
  },
  {
    name: 'browser_set_auto_dialog',
    description: 'Set automatic handling for all JavaScript dialogs',
    inputSchema: {
      type: 'object',
      properties: {
        handler: {
          type: 'string',
          enum: ['accept', 'dismiss', 'null'],
          description: 'Auto-handler: accept, dismiss, or null to disable'
        },
      },
    },
  },

  // ========== 控制台日志 ==========
  {
    name: 'browser_get_console_logs',
    description: 'Get console logs from the page (requires console capture to be enabled)',
    inputSchema: {
      type: 'object',
      properties: {
        types: {
          type: 'array',
          items: { type: 'string', enum: ['log', 'info', 'warn', 'error', 'debug'] },
          description: 'Filter by log types'
        },
      },
    },
  },
  {
    name: 'browser_enable_console_capture',
    description: 'Enable capturing of console logs from the page',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ========== 高级鼠标操作 ==========
  {
    name: 'browser_hover',
    description: `Hover over an element to trigger hover effects (tooltips, dropdown menus, etc.).

Note: Only supports CSS selector. For index-based interaction, use browser_click which supports the 'index' parameter.`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to hover' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_double_click',
    description: `Double-click on an element (e.g., to select a word or trigger double-click actions).

Note: Only supports CSS selector. For index-based interaction, consider using browser_click twice with the 'index' parameter.`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to double-click' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_right_click',
    description: `Right-click on an element to open context menu.

Note: Only supports CSS selector. The context menu that appears is the browser's native menu or a custom one defined by the page.`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to right-click' },
      },
      required: ['selector'],
    },
  },

  // ========== 资源下载 ==========
  {
    name: 'browser_download',
    description: `Download a page resource (image, video, audio, file) to local.

Supports two ways to specify the resource:
1. By element index (recommended): Use the index from browser_get_dom_tree output
2. By URL: Direct download from a URL

Note: CSS selector support is not yet implemented.

For resources on the current page (index), uses page context fetch to bypass anti-hotlinking.
Files are saved to Chrome's default download directory with timestamp-based filenames.

Example workflow:
1. browser_get_dom_tree → Find [3] img "Logo" @(10,10,200,50)
2. browser_download({ index: 3 }) → Downloads the image

Returns: { success: true, filename: "1706284800123.png", downloadId: 42 }`,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Resource URL for direct download' },
        index: { type: 'number', description: 'Element index from browser_get_dom_tree output (recommended)' },
        selector: { type: 'string', description: 'CSS selector to locate the media element (NOT YET IMPLEMENTED)' },
      },
    },
  },
];

/**
 * 工具名称到操作的映射
 */
function getActionFromToolName(toolName: string): string {
  const mapping: Record<string, string> = {
    // 页面控制锁定
    browser_lock: 'lock',
    browser_unlock: 'unlock',
    browser_update_status: 'update_status',

    // 基础导航和交互
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

    // 网络请求捕获
    browser_enable_network: 'enable_network',
    browser_disable_network: 'disable_network',
    browser_get_network_requests: 'get_network_requests',
    browser_get_network_requests_with_response: 'get_network_requests_with_response',
    browser_clear_network_requests: 'clear_network_requests',
    browser_wait_for_response: 'wait_for_response',

    // 等待机制
    browser_wait_for_selector: 'wait_for_selector',
    browser_wait_for_timeout: 'wait_for_timeout',
    browser_wait_for_load_state: 'wait_for_load_state',
    browser_wait_for_function: 'wait_for_function',

    // 文件上传
    browser_upload_file: 'upload_file',

    // 弹窗处理
    browser_get_dialog: 'get_dialog',
    browser_handle_dialog: 'handle_dialog',
    browser_set_auto_dialog: 'set_auto_dialog',

    // 控制台日志
    browser_get_console_logs: 'get_console_logs',
    browser_enable_console_capture: 'enable_console_capture',

    // 高级鼠标操作
    browser_hover: 'hover',
    browser_double_click: 'double_click',
    browser_right_click: 'right_click',

    // 资源下载
    browser_download: 'download',
  };
  return mapping[toolName] || toolName;
}

/**
 * 启动 WebSocket 服务器
 */
function startWebSocketServer(): WebSocketServer {
  const wss = new WebSocketServer({ host: '0.0.0.0', port: WS_PORT });
  wssInstance = wss;

  wss.on('connection', (ws) => {
    console.error(`[MCP Server] Browser extension connected`);
    extensionClient = ws;

    // 启动心跳检测
    startHeartbeat(ws);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'RESPONSE') {
          const pending = pendingRequests.get(message.id);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingRequests.delete(message.id);

            if (message.payload.success) {
              pending.resolve(message.payload.data);
            } else {
              pending.reject(new Error(message.payload.error || 'Unknown error'));
            }
          }
        }
      } catch (error) {
        console.error('[MCP Server] Failed to parse message:', error);
      }
    });

    ws.on('close', () => {
      console.error(`[MCP Server] Browser extension disconnected`);
      stopHeartbeat();
      if (extensionClient === ws) {
        extensionClient = null;
        // 清理所有待处理的请求
        clearPendingRequests('Browser extension disconnected');
      }
    });

    ws.on('error', (error) => {
      console.error('[MCP Server] WebSocket error:', error);
    });
  });

  wss.on('listening', () => {
    console.error(`[MCP Server] WebSocket server listening on port ${WS_PORT}`);
  });

  return wss;
}

/**
 * 优雅关闭
 */
function gracefulShutdown(signal: string): void {
  console.error(`[MCP Server] Received ${signal}, shutting down gracefully...`);

  // 断开 daemon 连接
  if (useDaemon) {
    disconnectFromDaemon();
  }

  // 停止心跳
  stopHeartbeat();

  // 清理待处理请求
  clearPendingRequests('Server shutting down');

  // 关闭 WebSocket 连接
  if (extensionClient) {
    extensionClient.close(1000, 'Server shutting down');
    extensionClient = null;
  }

  // 关闭 WebSocket 服务器
  if (wssInstance) {
    wssInstance.close(() => {
      console.error('[MCP Server] WebSocket server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }

  // 强制退出超时
  setTimeout(() => {
    console.error('[MCP Server] Force exit after timeout');
    process.exit(1);
  }, 5000);
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  // 注册信号处理
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // 尝试连接到 daemon
  console.error('[MCP Server] Attempting to connect to daemon...');
  const daemonConnected = await connectToDaemon();

  if (daemonConnected) {
    console.error('[MCP Server] Using daemon mode for multi-client support');
    useDaemon = true;
  } else {
    console.error('[MCP Server] Daemon not available, falling back to direct WebSocket mode');
    useDaemon = false;
    // 启动 WebSocket 服务器（回退模式）
    startWebSocketServer();
  }

  // 创建 MCP 服务器
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

  // 处理工具列表请求
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // 处理工具调用请求
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // 特殊处理连接状态检查（不需要实际连接扩展）
    if (name === 'browser_get_connection_status') {
      let isConnected = false;
      let mode = 'unknown';

      if (useDaemon && daemonSocket && sessionId) {
        isConnected = true;
        mode = 'daemon';
      } else if (extensionClient !== null && extensionClient.readyState === WebSocket.OPEN) {
        isConnected = true;
        mode = 'direct';
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              connected: isConnected,
              mode,
              sessionId: useDaemon ? sessionId : null,
              message: isConnected
                ? `Browser extension is connected and ready (${mode} mode).`
                : 'Browser extension is not connected. Please ask the user to open the Browser Agent extension side panel in Chrome.',
            }, null, 2),
          },
        ],
      };
    }

    try {
      const action = getActionFromToolName(name);
      const result = await sendToExtension(action, args as Record<string, unknown>);

      // 特殊处理截图结果
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

  // 连接 stdio 传输
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP Server] MCP Server started');
}

main().catch((error) => {
  console.error('[MCP Server] Fatal error:', error);
  process.exit(1);
});
