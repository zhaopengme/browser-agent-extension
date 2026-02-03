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
