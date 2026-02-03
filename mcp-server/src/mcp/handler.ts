import type { Context } from 'hono';
import { StreamableHTTPTransport } from '@hono/mcp';
import { createMcpServer } from './server.js';

const mcpServer = createMcpServer();

export async function mcpHandler(c: Context): Promise<Response> {
  const transport = new StreamableHTTPTransport();
  await mcpServer.connect(transport);
  const response = await transport.handleRequest(c);
  return response || new Response('Internal Server Error', { status: 500 });
}
