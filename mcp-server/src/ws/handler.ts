// mcp-server/src/ws/handler.ts

import type { Context } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { bridgeStore } from '../bridge/store.js';
import type { ExtMessage } from '../bridge/types.js';

export const wsHandler = upgradeWebSocket((c: Context) => {
  return {
    onOpen: (event, ws) => {
      console.error('[WS] Extension connection attempt');

      // Only accept one extension connection
      if (bridgeStore.isConnected()) {
        console.error('[WS] Extension already connected, rejecting new connection');
        ws.close(1000, 'Another extension is already connected');
        return;
      }

      console.error('[WS] Extension connection established');
    },

    onMessage: (event, ws) => {
      try {
        const message = JSON.parse(event.data as string) as ExtMessage;

        // Handle HELLO message (handshake)
        if (message.type === 'HELLO') {
          console.error(`[WS] Extension handshake completed, version: ${message.version}`);
          bridgeStore.setExtension(ws);
          return;
        }

        // Handle RESPONSE from extension
        if (message.type === 'RESPONSE') {
          bridgeStore.resolveResponse(message.id, message.result);
          return;
        }

        // Handle ERROR from extension
        if (message.type === 'ERROR') {
          bridgeStore.rejectResponse(message.id, message.error);
          return;
        }

        // Handle STATUS update
        if (message.type === 'STATUS') {
          console.error(`[WS] Extension status update: connected=${message.connected}`);
          return;
        }
      } catch (error) {
        console.error('[WS] Failed to parse extension message:', error);
      }
    },

    onClose: (event, ws) => {
      console.error('[WS] Extension disconnected');
      bridgeStore.removeExtension(ws);
    },

    onError: (event, ws) => {
      console.error('[WS] WebSocket error:', event);
    },
  };
});
