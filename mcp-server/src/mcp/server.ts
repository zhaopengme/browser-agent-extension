import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getActionFromToolName } from './tools/index.js';
import { getCookiesSchema, setCookieSchema, deleteCookiesSchema } from './tools/cookie-schemas.js';
import { bridgeStore } from '../bridge/store.js';
import { saveScreenshot } from '../utils/screenshot.js';
import pkg from '../../package.json' with { type: 'json' };

// Define all tool schemas using Zod
const toolSchemas = {
  // Navigation
  browser_navigate: {
    description: 'Navigate to a URL. Waits for page load. Returns the final URL and page title after navigation.',
    schema: z.object({
      url: z.string().describe('URL to navigate to (must include protocol, e.g. https://)'),
    }),
  },
  browser_click: {
    description: "Click an element. Prefer 'index' from browser_get_dom_tree for reliability. Set humanLike=true to simulate human behavior (mouse movement, random delays, smooth scroll). Alternatively use CSS selector or coordinates. Returns clicked element's tagName and text.",
    schema: z.object({
      index: z.number().optional().describe('Element index from browser_get_dom_tree (preferred)'),
      selector: z.string().optional().describe('CSS selector (fallback if no index)'),
      x: z.number().optional().describe('X coordinate for click (use with y)'),
      y: z.number().optional().describe('Y coordinate for click (use with x)'),
      button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button, default left'),
      clickCount: z.number().optional().describe('Number of clicks, default 1'),
      humanLike: z.boolean().optional().describe('Simulate human: mouse trajectory, random delays, smooth scroll. Default true; set false for instant click'),
    }),
  },
  browser_type: {
    description: "Type text into an input. Use 'index' from browser_get_dom_tree for reliable targeting. Set clearFirst=true to clear existing text first. Omit index/selector to type in the currently focused element.",
    schema: z.object({
      index: z.number().optional().describe('Element index from browser_get_dom_tree (preferred)'),
      selector: z.string().optional().describe('CSS selector (fallback if no index)'),
      text: z.string().describe('Text to type'),
      clearFirst: z.boolean().optional().describe('Clear existing text before typing, default false'),
      delay: z.number().optional().describe('Delay between keystrokes in ms (for human-like typing)'),
    }),
  },
  browser_scroll: {
    description: 'Scroll the page or a specific element. Use direction+distance for page scroll, or selector to scroll an element into view.',
    schema: z.object({
      direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction, default down'),
      distance: z.number().optional().describe('Pixels to scroll, default 500'),
      selector: z.string().optional().describe('CSS selector to scroll element into view'),
      x: z.number().optional().describe('Scroll to absolute X position'),
      y: z.number().optional().describe('Scroll to absolute Y position'),
    }),
  },
  browser_press_key: {
    description: 'Press a keyboard key. Supports special keys like Enter, Escape, Tab, ArrowUp, etc.',
    schema: z.object({
      key: z.string().describe('Key to press (e.g., "Enter", "Escape", "Tab", "ArrowDown", "Ctrl+A")'),
    }),
  },
  browser_go_back: {
    description: 'Navigate back in browser history. Waits for page load after navigation.',
    schema: z.object({}),
  },
  browser_go_forward: {
    description: 'Navigate forward in browser history. Waits for page load after navigation.',
    schema: z.object({}),
  },
  browser_reload: {
    description: 'Reload the current page. Waits for page load to complete.',
    schema: z.object({}),
  },
  // Info
  browser_screenshot: {
    description: 'Capture a screenshot and save to a local file. Returns the file path. Defaults: JPEG format, quality 60, maxWidth 1280px. Override with format/quality/maxWidth params for higher fidelity.',
    schema: z.object({
      fullPage: z.boolean().optional().describe('Capture full page including off-screen content, default false'),
      format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Image format, default png'),
      quality: z.number().min(1).max(100).optional().describe('JPEG/WebP quality (1-100), default 80'),
      maxWidth: z.number().optional().describe('Max width in pixels - scales down if page is wider (reduces token usage)'),
    }),
  },
  browser_screenshot_annotated: {
    description: 'Take an annotated screenshot with interactive elements highlighted and numbered. Returns file path and element index list. Use this instead of calling get_dom_tree + screenshot separately.',
    schema: z.object({
      fullPage: z.boolean().optional().describe('Capture full page including off-screen content, default false'),
      format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Image format, default png'),
      quality: z.number().min(1).max(100).optional().describe('JPEG/WebP quality (1-100), default 80'),
      maxWidth: z.number().optional().describe('Max width in pixels - scales down if page is wider'),
    }),
  },
  browser_extract: {
    description: 'Extract text and HTML content from an element matching a CSS selector.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the element to extract from'),
    }),
  },
  browser_evaluate: {
    description: 'Execute JavaScript in the page context and return the result. Useful for reading DOM state, triggering events, or performing complex operations.',
    schema: z.object({
      script: z.string().describe('JavaScript code to execute. Can return a value (use return statement or expression).'),
    }),
  },
  browser_get_page_info: {
    description: 'Get current page URL, title, and basic metadata.',
    schema: z.object({}),
  },
  browser_get_dom_tree: {
    description: 'Get a compact DOM tree listing interactive elements (links, buttons, inputs, etc.) with numbered indices. Use these indices with browser_click and browser_type for reliable element targeting. Supports Shadow DOM. This is the recommended first step before interacting with a page.',
    schema: z.object({
      selector: z.string().optional().describe('Limit tree to a specific CSS selector scope'),
      maxDepth: z.number().optional().describe('Maximum DOM traversal depth, default 15'),
      excludeTags: z.array(z.string()).optional().describe('Additional HTML tags to exclude from output'),
    }),
  },
  browser_get_dom_tree_full: {
    description: 'Get the full DOM tree as JSON with all visible elements, positions, and attributes. More verbose than browser_get_dom_tree - use only when you need complete DOM structure.',
    schema: z.object({
      selector: z.string().optional().describe('Root element CSS selector, defaults to body'),
    }),
  },
  browser_get_dom_tree_structured: {
    description: 'Get a structured DOM tree with all visible elements including layout containers. Useful for understanding page structure and element relationships.',
    schema: z.object({
      selector: z.string().optional().describe('Root element CSS selector'),
      maxDepth: z.number().optional().describe('Maximum traversal depth'),
    }),
  },
  browser_get_dom_tree_aria: {
    description: 'Get a compact ARIA accessibility tree of the page. Similar to browser_get_dom_tree but focused on accessibility roles and labels. Useful for understanding how screen readers see the page.',
    schema: z.object({
      selector: z.string().optional().describe('Root element CSS selector'),
      maxDepth: z.number().optional().describe('Maximum traversal depth'),
    }),
  },
  browser_markdown: {
    description: 'Convert page HTML to Markdown for text extraction. Useful for reading page content without visual noise. Optionally target a specific element via CSS selector. Max 500K chars.',
    schema: z.object({
      selector: z.string().optional().describe('CSS selector to target specific element (defaults to body)'),
    }),
  },
  browser_get_connection_status: {
    description: 'Check if the browser extension is connected and ready to receive commands. Use this to diagnose connection issues.',
    schema: z.object({}),
  },
  // Tabs
  browser_get_tabs: {
    description: 'Get a list of all open browser tabs with their IDs, URLs, and titles.',
    schema: z.object({}),
  },
  browser_switch_tab: {
    description: 'Switch the active tab to a specific tab by its ID. Use browser_get_tabs to find available tab IDs.',
    schema: z.object({
      tabId: z.number().describe('Tab ID to switch to (from browser_get_tabs)'),
    }),
  },
  browser_create_tab: {
    description: 'Create a new browser tab. Switches to it by default. Use background param to keep current tab active.',
    schema: z.object({
      url: z.string().optional().describe('URL to open, defaults to about:blank'),
      background: z.boolean().optional().describe('If true, open in background without switching to it'),
    }),
  },
  browser_close_tab: {
    description: 'Close a browser tab. Defaults to current active tab. When closing the active tab, automatically switches to the most recently used tab.',
    schema: z.object({
      tabId: z.number().optional().describe('Tab ID to close. Defaults to current active tab.'),
    }),
  },
  browser_blur: {
    description: 'Remove focus from the currently focused element or a specific element. Useful after typing to trigger blur events.',
    schema: z.object({
      index: z.number().optional().describe('Element index from browser_get_dom_tree'),
      selector: z.string().optional().describe('CSS selector (omit to blur currently focused element)'),
    }),
  },
  browser_select_option: {
    description: 'Select an option from a <select> dropdown by value, text, or index.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the <select> element'),
      value: z.string().optional().describe('Option value attribute to select'),
      text: z.string().optional().describe('Option display text to select'),
      index: z.number().optional().describe('Option index (0-based) to select'),
    }),
  },
  // Network
  browser_enable_network: {
    description: 'Enable network request capturing. Must be called before using browser_get_network_requests.',
    schema: z.object({}),
  },
  browser_disable_network: {
    description: 'Disable network request capturing and stop recording new requests.',
    schema: z.object({}),
  },
  browser_get_network_requests: {
    description: 'Get captured network requests. Requires browser_enable_network to be called first. Filter by URL pattern, HTTP method, status code, or resource type.',
    schema: z.object({
      urlPattern: z.string().optional().describe('Filter by URL pattern (substring match)'),
      method: z.string().optional().describe('Filter by HTTP method (GET, POST, etc.)'),
      statusCode: z.number().optional().describe('Filter by HTTP status code'),
      resourceType: z.string().optional().describe('Filter by resource type (XHR, Fetch, Document, etc.)'),
      clear: z.boolean().optional().describe('Clear the request log after returning results'),
    }),
  },
  browser_get_network_requests_with_response: {
    description: 'Get captured network requests including response bodies. Requires browser_enable_network. Note: response bodies may be large.',
    schema: z.object({
      urlPattern: z.string().optional().describe('Filter by URL pattern (substring match)'),
      method: z.string().optional().describe('Filter by HTTP method'),
      statusCode: z.number().optional().describe('Filter by HTTP status code'),
      resourceType: z.string().optional().describe('Filter by resource type'),
      clear: z.boolean().optional().describe('Clear the request log after returning results'),
    }),
  },
  browser_clear_network_requests: {
    description: 'Clear all captured network requests from the log.',
    schema: z.object({}),
  },
  browser_wait_for_response: {
    description: 'Wait for a network response matching a URL pattern. Useful for waiting for API calls to complete.',
    schema: z.object({
      urlPattern: z.string().describe('URL pattern to match (substring)'),
      method: z.string().optional().describe('HTTP method to match'),
      timeout: z.number().optional().describe('Timeout in ms, default 30000'),
    }),
  },
  // Waiting
  browser_wait_for_selector: {
    description: 'Wait for a CSS selector to appear (or disappear) in the DOM. Returns whether the element was found.',
    schema: z.object({
      selector: z.string().describe('CSS selector to wait for'),
      visible: z.boolean().optional().describe('Wait for element to be visible'),
      hidden: z.boolean().optional().describe('Wait for element to be hidden'),
      timeout: z.number().optional().describe('Timeout in ms, default 30000'),
    }),
  },
  browser_wait_for_timeout: {
    description: 'Wait for a fixed amount of time. Use sparingly - prefer browser_wait_for_selector or browser_wait_for_load_state when possible.',
    schema: z.object({
      ms: z.number().describe('Milliseconds to wait'),
    }),
  },
  browser_wait_for_load_state: {
    description: "Wait for the page to reach a specific load state. 'domcontentloaded' is fastest, 'load' waits for all resources, 'networkidle' waits for no network activity.",
    schema: z.object({
      state: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().describe("Load state to wait for, default 'load'"),
      timeout: z.number().optional().describe('Timeout in ms, default 30000'),
    }),
  },
  browser_wait_for_function: {
    description: 'Wait for a JavaScript expression to return a truthy value. Polls the expression until it returns true or times out.',
    schema: z.object({
      function: z.string().describe('JavaScript expression to evaluate (should return truthy when ready)'),
      timeout: z.number().optional().describe('Timeout in ms, default 30000'),
      polling: z.number().optional().describe('Polling interval in ms, default 100'),
    }),
  },
  // Interaction
  browser_upload_file: {
    description: 'Upload file(s) to a file input element.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the file input element'),
      files: z.array(z.string()).describe('Array of absolute file paths to upload'),
    }),
  },
  browser_get_dialog: {
    description: 'Get information about the current JavaScript dialog (alert, confirm, prompt) if one is open.',
    schema: z.object({}),
  },
  browser_handle_dialog: {
    description: 'Accept or dismiss the current JavaScript dialog. For prompt dialogs, provide promptText.',
    schema: z.object({
      accept: z.boolean().optional().describe('Accept (true) or dismiss (false) the dialog, default true'),
      promptText: z.string().optional().describe('Text to enter in prompt dialogs'),
    }),
  },
  browser_set_auto_dialog: {
    description: 'Set an automatic handler for JavaScript dialogs. Once set, dialogs will be automatically accepted or dismissed.',
    schema: z.object({
      handler: z.enum(['accept', 'dismiss']).nullable().describe("'accept' to auto-accept, 'dismiss' to auto-dismiss, null to disable"),
    }),
  },
  browser_get_console_logs: {
    description: 'Get browser console logs. Requires browser_enable_console_capture to be called first.',
    schema: z.object({
      types: z.array(z.string()).optional().describe("Filter by log type: 'log', 'warn', 'error', 'info', 'debug'"),
    }),
  },
  browser_enable_console_capture: {
    description: 'Enable browser console log capturing. Must be called before using browser_get_console_logs.',
    schema: z.object({}),
  },
  // Advanced mouse
  browser_hover: {
    description: 'Hover the mouse over an element to trigger hover effects or reveal hidden menus.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the element to hover over'),
    }),
  },
  browser_double_click: {
    description: 'Double-click an element. Useful for text selection or activating items that require double-click.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the element to double-click'),
    }),
  },
  browser_right_click: {
    description: 'Right-click an element to open its context menu.',
    schema: z.object({
      selector: z.string().describe('CSS selector for the element to right-click'),
    }),
  },
  browser_download: {
    description: 'Download a resource. Provide a direct URL, or use index from browser_get_dom_tree to download a resource linked by an element (img, video, audio, a[download]).',
    schema: z.object({
      url: z.string().optional().describe('Direct URL to download'),
      index: z.number().optional().describe('Element index from browser_get_dom_tree (for img, video, audio, download links)'),
      selector: z.string().optional().describe('CSS selector (not yet implemented, use index instead)'),
    }),
  },
  // Cookies
  browser_get_cookies: {
    description: 'Get browser cookies for the current page or specified URLs. Returns full cookie details including domain, path, httpOnly, secure, sameSite, expiration, and partitionKey (when present). If no URLs specified, returns cookies for the current page and all its subframes.',
    schema: getCookiesSchema,
  },
  browser_set_cookie: {
    description: 'Set a browser cookie with full attribute control. You MUST provide either a url OR a domain (not both). On success returns {success: true}; on failure throws a protocol error.',
    schema: setCookieSchema,
  },
  browser_delete_cookies: {
    description: 'Delete browser cookies by name. Optionally narrow down by url, domain, or path to target specific cookies. Note: reports command completion, not whether a matching cookie actually existed.',
    schema: deleteCookiesSchema,
  },
  // Lock/Unlock overlay
  browser_lock: {
    description: 'Show an overlay on the page indicating the agent is in control. Blocks user interaction.',
    schema: z.object({
      status: z.string().optional().describe('Status message to display, default "Agent is controlling this page"'),
    }),
  },
  browser_unlock: {
    description: 'Hide the agent control overlay and restore user interaction.',
    schema: z.object({}),
  },
  browser_update_status: {
    description: 'Update the status message shown in the agent control overlay.',
    schema: z.object({
      status: z.string().describe('New status message to display'),
      shimmer: z.boolean().optional().describe('Enable shimmer animation on the status text'),
    }),
  },
};

function computeBridgeTimeout(toolName: string, args: Record<string, unknown>): number | undefined {
  const BUFFER_MS = 5000;
  if ('timeout' in args && typeof args.timeout === 'number') {
    return args.timeout + BUFFER_MS;
  }
  if (toolName === 'browser_wait_for_timeout' && typeof args.ms === 'number') {
    return args.ms + BUFFER_MS;
  }
  return undefined;
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'browser-agent',
    version: pkg.version,
  });

  // Register all tools with Zod schemas
  for (const [toolName, config] of Object.entries(toolSchemas)) {
    const action = getActionFromToolName(toolName);

    server.registerTool(
      toolName,
      {
        description: config.description,
        inputSchema: config.schema,
      },
      async (args: any) => {
        if (toolName === 'browser_evaluate' && args.script) {
          const scriptLen = args.script.length;
          const scriptPreview = scriptLen > 200 ? args.script.slice(0, 200) + '...' : args.script;
          console.error(`[MCP] Tool ${toolName} called (script: ${scriptLen} chars): ${scriptPreview}`);
        } else {
          console.error(`[MCP] Tool ${toolName} called with args:`, JSON.stringify(args));
        }

        // Special handling for connection status
        if (toolName === 'browser_get_connection_status') {
          const isConnected = bridgeStore.isConnected();
          const isReady = bridgeStore.isReady();
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                connected: isConnected,
                ready: isReady,
                message: isConnected
                  ? isReady
                    ? 'Browser extension is connected and ready.'
                    : 'Browser extension is connected but busy.'
                  : 'Browser extension is not connected. Please open the Browser Agent extension side panel.',
              }, null, 2),
            }],
          };
        }

        // Apply screenshot defaults to reduce file size (~3.5MB PNG → ~200-400KB JPEG)
        if (toolName === 'browser_screenshot' || toolName === 'browser_screenshot_annotated') {
          args = {
            format: 'jpeg',
            quality: 60,
            maxWidth: 1280,
            ...args,
          };
        }

        try {
          const start = Date.now();
          const bridgeTimeout = computeBridgeTimeout(toolName, args);
          const result = await bridgeStore.sendRequest({ action, params: args }, bridgeTimeout);
          const duration = Date.now() - start;
          console.error(`[MCP] ${toolName} completed in ${duration}ms`);

          // Special handling for screenshot - save to file instead of returning base64
          if ((toolName === 'browser_screenshot' || toolName === 'browser_screenshot_annotated') && result && typeof result === 'object') {
            // Extension may return direct { image, width, height } or wrapped { success, data: { image, width, height } }
            const raw = result as Record<string, unknown>;
            const screenshotResult = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as { image?: string; width?: number; height?: number; elements?: string; elementCount?: number };
            if (screenshotResult.image) {
              const format = (args.format as 'png' | 'jpeg' | 'webp') || 'jpeg';
              const filePath = await saveScreenshot(screenshotResult.image, format);
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Screenshot saved: ${filePath}\nDimensions: ${screenshotResult.width}x${screenshotResult.height}\nFormat: ${format}${screenshotResult.elements ? `\nElements (${screenshotResult.elementCount}): ${screenshotResult.elements}` : ''}`,
                  },
                ],
              };
            }
          }

          // Serialize once, reuse for logging and response
          const resultJson = JSON.stringify(result);

          if (toolName === 'browser_evaluate') {
            const preview = resultJson.length > 500 ? resultJson.slice(0, 500) + '...' : resultJson;
            console.error(`[MCP] ${toolName} result (${resultJson.length} chars): ${preview}`);
          }

          return { content: [{ type: 'text' as const, text: resultJson }] };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return { content: [{ type: 'text' as const, text: `Error: ${errorMessage}` }], isError: true };
        }
      }
    );
  }

  return server;
}
