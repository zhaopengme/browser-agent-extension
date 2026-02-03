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
