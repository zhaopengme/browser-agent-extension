import type { Context } from 'hono';
import { StreamableHTTPTransport } from '@hono/mcp';
import { logger } from '../utils/logger.js';
import { createMcpServer } from './server.js';

export const mcpServer = createMcpServer();
const transport = new StreamableHTTPTransport();

// Connection lock to prevent race conditions
let connectingPromise: Promise<void> | null = null;
let connectionError: Error | null = null;

export async function mcpHandler(c: Context): Promise<Response> {
  // Only connect if not already connected
  if (!mcpServer.isConnected()) {
    // If another request is connecting, wait for it
    if (!connectingPromise) {
      connectingPromise = (async () => {
        try {
          connectionError = null;
          await mcpServer.connect(transport);
          logger.info('MCP', 'MCP server connected');
        } catch (error) {
          connectionError = error instanceof Error ? error : new Error(String(error));
          logger.error('MCP', 'Failed to connect MCP server', error);
          throw connectionError;
        }
      })();

      // Clean up promise when done (success or failure)
      connectingPromise.finally(() => {
        connectingPromise = null;
      });
    }

    try {
      await connectingPromise;
    } catch {
      // Return error response if connection failed
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: connectionError?.message || 'Failed to connect MCP server',
          },
          id: null,
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  const response = await transport.handleRequest(c);
  return response ?? new Response('Internal Server Error', { status: 500 });
}
