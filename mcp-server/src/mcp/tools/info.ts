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
