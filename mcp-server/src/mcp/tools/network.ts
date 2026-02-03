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
