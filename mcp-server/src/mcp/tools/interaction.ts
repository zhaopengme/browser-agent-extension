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
