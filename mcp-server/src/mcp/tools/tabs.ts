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
