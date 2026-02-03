import type { Context } from 'hono';
import { StreamableHTTPTransport } from '@hono/mcp';
import { createMcpServer } from './server.js';

const mcpServer = createMcpServer();
const transport = new StreamableHTTPTransport();

export async function mcpHandler(c: Context): Promise<Response> {
  // Only connect if not already connected
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }
  const response = await transport.handleRequest(c);
  return response ?? new Response('Internal Server Error', { status: 500 });
}
