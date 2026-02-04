import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getActionFromToolName } from './tools/index.js';
import { bridgeStore } from '../bridge/store.js';

// Define all tool schemas using Zod
const toolSchemas = {
  // Navigation
  browser_navigate: {
    description: 'Navigate to a URL',
    schema: z.object({
      url: z.string().describe('URL to navigate to'),
    }),
  },
  browser_click: {
    description: 'Click on an element by index or selector',
    schema: z.object({
      index: z.number().optional().describe('Element index from DOM tree'),
      selector: z.string().optional().describe('CSS selector'),
    }),
  },
  browser_type: {
    description: 'Type text into an input field',
    schema: z.object({
      index: z.number().optional().describe('Element index from DOM tree'),
      selector: z.string().optional().describe('CSS selector'),
      text: z.string().describe('Text to type'),
      submit: z.boolean().optional().describe('Press Enter after typing'),
      clear: z.boolean().optional().describe('Clear field before typing'),
    }),
  },
  browser_scroll: {
    description: 'Scroll the page',
    schema: z.object({
      direction: z.enum(['up', 'down', 'left', 'right']).optional(),
      amount: z.number().optional().describe('Pixels to scroll'),
      selector: z.string().optional().describe('Scroll specific element to view'),
    }),
  },
  browser_press_key: {
    description: 'Press a keyboard key',
    schema: z.object({
      key: z.string().describe('Key to press (e.g., "Enter", "Escape")'),
    }),
  },
  browser_go_back: {
    description: 'Navigate back in browser history',
    schema: z.object({}),
  },
  browser_go_forward: {
    description: 'Navigate forward in browser history',
    schema: z.object({}),
  },
  browser_reload: {
    description: 'Reload the current page',
    schema: z.object({}),
  },
  // Info
  browser_screenshot: {
    description: 'Take a screenshot of the page',
    schema: z.object({
      fullPage: z.boolean().optional().describe('Capture full page'),
      format: z.enum(['png', 'jpeg', 'webp']).optional(),
      quality: z.number().min(1).max(100).optional().describe('JPEG quality (1-100), default 80'),
      maxWidth: z.number().optional().describe('Max width in pixels (scales down if larger)'),
    }),
  },
  browser_extract: {
    description: 'Extract text from an element',
    schema: z.object({
      selector: z.string().describe('CSS selector'),
    }),
  },
  browser_evaluate: {
    description: 'Execute JavaScript in the page',
    schema: z.object({
      script: z.string().describe('JavaScript code to execute'),
    }),
  },
  browser_get_page_info: {
    description: 'Get current page URL and title',
    schema: z.object({}),
  },
  browser_get_dom_tree: {
    description: 'Get compact DOM tree of interactive elements',
    schema: z.object({
      selector: z.string().optional(),
      maxDepth: z.number().optional(),
    }),
  },
  browser_get_dom_tree_full: {
    description: 'Get full DOM tree',
    schema: z.object({
      selector: z.string().optional(),
    }),
  },
  browser_markdown: {
    description: 'Convert page content to Markdown format',
    schema: z.object({
      selector: z.string().optional().describe('CSS selector to target specific element (optional, defaults to body if not provided)'),
    }),
  },
  browser_get_connection_status: {
    description: 'Check browser extension connection status',
    schema: z.object({}),
  },
  // Tabs
  browser_get_tabs: {
    description: 'Get all open tabs',
    schema: z.object({}),
  },
  browser_switch_tab: {
    description: 'Switch to a specific tab',
    schema: z.object({
      tabId: z.number().describe('Tab ID to switch to'),
    }),
  },
  browser_blur: {
    description: 'Remove focus from current element',
    schema: z.object({}),
  },
  browser_select_option: {
    description: 'Select an option from a dropdown',
    schema: z.object({
      selector: z.string().describe('CSS selector'),
      value: z.string().optional(),
      text: z.string().optional(),
      index: z.number().optional(),
    }),
  },
  // Network
  browser_enable_network: {
    description: 'Enable network request capturing',
    schema: z.object({}),
  },
  browser_disable_network: {
    description: 'Disable network request capturing',
    schema: z.object({}),
  },
  browser_get_network_requests: {
    description: 'Get captured network requests',
    schema: z.object({
      urlPattern: z.string().optional(),
      method: z.string().optional(),
    }),
  },
  browser_get_network_requests_with_response: {
    description: 'Get captured network requests with response bodies',
    schema: z.object({
      urlPattern: z.string().optional(),
      method: z.string().optional(),
    }),
  },
  browser_clear_network_requests: {
    description: 'Clear captured network requests',
    schema: z.object({}),
  },
  browser_wait_for_response: {
    description: 'Wait for a network response matching pattern',
    schema: z.object({
      urlPattern: z.string().describe('URL pattern to match'),
      method: z.string().optional(),
      timeout: z.number().optional(),
    }),
  },
  // Waiting
  browser_wait_for_selector: {
    description: 'Wait for an element to appear',
    schema: z.object({
      selector: z.string().describe('CSS selector'),
      visible: z.boolean().optional(),
      hidden: z.boolean().optional(),
      timeout: z.number().optional(),
    }),
  },
  browser_wait_for_timeout: {
    description: 'Wait for specified time',
    schema: z.object({
      ms: z.number().describe('Milliseconds to wait'),
    }),
  },
  browser_wait_for_load_state: {
    description: 'Wait for page load state',
    schema: z.object({
      state: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
      timeout: z.number().optional(),
    }),
  },
  browser_wait_for_function: {
    description: 'Wait for JavaScript function to return truthy',
    schema: z.object({
      function: z.string().describe('JavaScript function to evaluate'),
      timeout: z.number().optional(),
      polling: z.number().optional(),
    }),
  },
  // Interaction
  browser_upload_file: {
    description: 'Upload file(s) to a file input',
    schema: z.object({
      selector: z.string().describe('CSS selector for file input'),
      files: z.array(z.string()).describe('Array of file paths'),
    }),
  },
  browser_get_dialog: {
    description: 'Get current JavaScript dialog info',
    schema: z.object({}),
  },
  browser_handle_dialog: {
    description: 'Handle JavaScript dialog',
    schema: z.object({
      accept: z.boolean().optional(),
      promptText: z.string().optional(),
    }),
  },
  browser_set_auto_dialog: {
    description: 'Set automatic dialog handler',
    schema: z.object({
      handler: z.enum(['accept', 'dismiss']).nullable(),
    }),
  },
  browser_get_console_logs: {
    description: 'Get browser console logs',
    schema: z.object({
      types: z.array(z.string()).optional(),
    }),
  },
  browser_enable_console_capture: {
    description: 'Enable console log capturing',
    schema: z.object({}),
  },
  // Advanced
  browser_hover: {
    description: 'Hover over an element',
    schema: z.object({
      selector: z.string().describe('CSS selector'),
    }),
  },
  browser_double_click: {
    description: 'Double-click an element',
    schema: z.object({
      selector: z.string().describe('CSS selector'),
    }),
  },
  browser_right_click: {
    description: 'Right-click an element',
    schema: z.object({
      selector: z.string().describe('CSS selector'),
    }),
  },
  browser_download: {
    description: 'Download a resource',
    schema: z.object({
      url: z.string().optional(),
      index: z.number().optional(),
    }),
  },
  // Lock/Unlock
  browser_lock: {
    description: 'Lock the browser page',
    schema: z.object({
      status: z.string().optional(),
    }),
  },
  browser_unlock: {
    description: 'Unlock the browser page',
    schema: z.object({}),
  },
  browser_update_status: {
    description: 'Update lock status message',
    schema: z.object({
      status: z.string(),
      shimmer: z.boolean().optional(),
    }),
  },
};

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'browser-agent',
    version: '1.0.0',
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
        console.error(`[MCP] Tool ${toolName} called with args:`, JSON.stringify(args));

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

        try {
          const result = await bridgeStore.sendRequest({ action, params: args });

          // Special handling for screenshot
          if (toolName === 'browser_screenshot' && result && typeof result === 'object') {
            const screenshotResult = result as { image?: string; width?: number; height?: number };
            if (screenshotResult.image) {
              return {
                content: [
                  { type: 'image' as const, data: screenshotResult.image, mimeType: 'image/png' },
                  { type: 'text' as const, text: `Screenshot captured: ${screenshotResult.width}x${screenshotResult.height}` },
                ],
              };
            }
          }

          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return { content: [{ type: 'text' as const, text: `Error: ${errorMessage}` }], isError: true };
        }
      }
    );
  }

  return server;
}
