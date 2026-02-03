import type { Context } from 'hono';
import { StreamableHTTPTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';

const mcpServer = createMcpServer();
const transport = new StreamableHTTPTransport('/mcp');
await mcpServer.connect(transport);

export async function mcpHandler(c: Context): Promise<Response> {
  return transport.handleRequest(c.req.raw);
}
