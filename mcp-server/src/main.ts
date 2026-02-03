#!/usr/bin/env node
// mcp-server/src/main.ts

/**
 * Browser Agent MCP Server with Hono
 *
 * Provides:
 * - /mcp - MCP Streamable HTTP endpoint
 * - /ws - WebSocket endpoint for browser extension
 * - /health - Health check endpoint
 */

import { Hono } from 'hono';
import { websocket } from 'hono/bun';
import { mcpHandler } from './mcp/handler.js';
import { wsHandler } from './ws/handler.js';
import { bridgeStore } from './bridge/store.js';
import { logger } from './middleware/logger.js';

const app = new Hono();

// 添加请求日志中间件
app.use('*', logger);

// MCP Streamable HTTP endpoint
app.all('/mcp', mcpHandler);

// WebSocket endpoint for browser extension
app.get('/ws', wsHandler);

// Health check
app.get('/health', (c) => {
  const state = bridgeStore.getState();
  return c.json({
    status: 'ok',
    extensionConnected: bridgeStore.isConnected(),
    state: state.status,
  });
});

// Default port
const PORT = parseInt(process.env.PORT || '3026');

console.error(`[Server] Starting Browser Agent MCP Server...`);
console.error(`[Server] MCP endpoint: http://localhost:${PORT}/mcp`);
console.error(`[Server] WebSocket endpoint: ws://localhost:${PORT}/ws`);
console.error(`[Server] Health check: http://localhost:${PORT}/health`);

// Export for Bun
export default {
  fetch: app.fetch,
  websocket,
  idleTimeout: 255,
  port: PORT,
};
