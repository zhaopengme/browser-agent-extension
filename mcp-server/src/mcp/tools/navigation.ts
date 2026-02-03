// mcp-server/src/mcp/tools/navigation.ts

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

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
