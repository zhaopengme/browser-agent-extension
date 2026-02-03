// mcp-server/src/mcp/tools/navigation.ts

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// New Zod schemas for MCP SDK v1.25+
export const navigationToolSchemas = {
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
};

// Legacy JSON Schema format for backwards compatibility
export const navigationTools: Tool[] = [
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_click',
    description: 'Click on an element by index or selector',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Element index from DOM tree' },
        selector: { type: 'string', description: 'CSS selector' },
      },
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Element index from DOM tree' },
        selector: { type: 'string', description: 'CSS selector' },
        text: { type: 'string', description: 'Text to type' },
        submit: { type: 'boolean', description: 'Press Enter after typing' },
        clear: { type: 'boolean', description: 'Clear field before typing' },
      },
      required: ['text'],
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        amount: { type: 'number', description: 'Pixels to scroll' },
        selector: { type: 'string', description: 'Scroll specific element to view' },
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
