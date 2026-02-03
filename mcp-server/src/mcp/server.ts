import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { allTools, getActionFromToolName } from './tools/index.js';
import { bridgeStore } from '../bridge/store.js';

export function createMcpServer(): Server {
  const server = new Server(
    { name: 'browser-agent', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'browser_get_connection_status') {
      const isConnected = bridgeStore.isConnected();
      const isReady = bridgeStore.isReady();
      return {
        content: [{
          type: 'text',
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
      const action = getActionFromToolName(name);
      const result = await bridgeStore.sendRequest({ action, params: args });

      if (name === 'browser_screenshot' && result && typeof result === 'object') {
        const screenshotResult = result as { image?: string; width?: number; height?: number };
        if (screenshotResult.image) {
          return {
            content: [
              { type: 'image', data: screenshotResult.image, mimeType: 'image/png' },
              { type: 'text', text: `Screenshot captured: ${screenshotResult.width}x${screenshotResult.height}` },
            ],
          };
        }
      }

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: `Error: ${errorMessage}` }], isError: true };
    }
  });

  return server;
}
