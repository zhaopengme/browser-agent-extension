import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { allTools, getActionFromToolName } from './tools/index.js';
import { bridgeStore } from '../bridge/store.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'browser-agent',
    version: '1.0.0',
  });

  // Register all tools
  for (const tool of allTools) {
    const action = getActionFromToolName(tool.name);
    
    server.tool(
      tool.name,
      tool.description || '',
      tool.inputSchema as any,
      async (args: any) => {
        // Special handling for connection status
        if (tool.name === 'browser_get_connection_status') {
          const isConnected = bridgeStore.isConnected();
          const isReady = bridgeStore.isReady();
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                connected: isConnected,
                ready: isReady,
                message: isConnected
                  ? isReady
                    ? 'Browser extension is connected and ready.'
                    : 'Browser extension is connected but busy.'
                  : 'Browser extension is not connected. Please open the Browser Agent extension side panel.',
              }, null, 2),
            }],
          };
        }

        try {
          const result = await bridgeStore.sendRequest({ action, params: args });

          // Special handling for screenshot
          if (tool.name === 'browser_screenshot' && result && typeof result === 'object') {
            const screenshotResult = result as { image?: string; width?: number; height?: number };
            if (screenshotResult.image) {
              return {
                content: [
                  { type: 'image' as const, data: screenshotResult.image, mimeType: 'image/png' },
                  { type: 'text' as const, text: `Screenshot captured: ${screenshotResult.width}x${screenshotResult.height}` },
                ],
              };
            }
          }

          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return { content: [{ type: 'text' as const, text: `Error: ${errorMessage}` }], isError: true };
        }
      }
    );
  }

  return server;
}
