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
import { logger } from './utils/logger.js';
import { createMcpServer } from './mcp/server.js';

const app = new Hono();
const mcpServer = createMcpServer();

// Simple request logging middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  logger.debug('HTTP', `${c.req.method} ${c.req.url} - ${c.res.status} (${duration}ms)`);
});

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

logger.info('Server', `Starting Browser Agent MCP Server on port ${PORT}`);
logger.info('Server', `MCP endpoint: http://localhost:${PORT}/mcp`);
logger.info('Server', `WebSocket endpoint: ws://localhost:${PORT}/ws`);
logger.info('Server', `Health check: http://localhost:${PORT}/health`);

// Graceful shutdown handling
async function gracefulShutdown(signal: string) {
  logger.info('Server', `Received ${signal}, starting graceful shutdown...`);

  // Close bridge connections
  if (bridgeStore.hasConnection()) {
    logger.info('Server', 'Closing bridge connection...');
    bridgeStore.forceCleanup();
  }

  // Close MCP server
  try {
    if (mcpServer.isConnected()) {
      await mcpServer.close();
      logger.info('Server', 'MCP server closed');
    }
  } catch (error) {
    logger.error('Server', 'Error closing MCP server', error);
  }

  logger.info('Server', 'Graceful shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Server', 'Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Server', 'Unhandled rejection', reason);
});

// Export for Bun
export default {
  fetch: app.fetch,
  websocket,
  idleTimeout: 255,
  port: PORT,
};
