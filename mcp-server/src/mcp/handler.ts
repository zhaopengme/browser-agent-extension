import type { Context } from 'hono';
import { StreamableHTTPTransport } from '@hono/mcp';
import { createMcpServer } from './server.js';

const mcpServer = createMcpServer();
const transport = new StreamableHTTPTransport();

// Connection lock to prevent race conditions
let connectingPromise: Promise<void> | null = null;

export async function mcpHandler(c: Context): Promise<Response> {
  // Only connect if not already connected
  if (!mcpServer.isConnected()) {
    // If another request is connecting, wait for it
    if (!connectingPromise) {
      connectingPromise = mcpServer.connect(transport).finally(() => {
        connectingPromise = null;
      });
    }
    await connectingPromise;
  }
  const response = await transport.handleRequest(c);
  return response ?? new Response('Internal Server Error', { status: 500 });
}
