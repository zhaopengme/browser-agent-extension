import type { Context } from 'hono';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';

let transport: StreamableHTTPServerTransport | null = null;

export async function initMcpTransport(): Promise<StreamableHTTPServerTransport> {
  if (transport) return transport;
  
  const mcpServer = createMcpServer();
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcpServer.connect(transport);
  return transport;
}

export async function mcpHandler(c: Context): Promise<Response> {
  // For now, return a simple not implemented response
  // The StreamableHTTPServerTransport requires Node.js req/res objects
  // We'll need to use a different approach for Bun/Hono compatibility
  return c.json({ error: 'MCP endpoint requires Node.js compatibility layer' }, 501);
}
