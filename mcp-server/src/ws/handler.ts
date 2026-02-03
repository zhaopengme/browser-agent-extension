// mcp-server/src/ws/handler.ts

import type { Context } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import type { WSContext } from 'hono/ws';
import { bridgeStore } from '../bridge/store.js';
import type { ExtMessage } from '../bridge/types.js';

const HELLO_TIMEOUT = 10000; // 10 seconds to send HELLO

export const wsHandler = upgradeWebSocket((c: Context) => {
  let helloTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    onOpen: (event: Event, ws: WSContext) => {
      console.error('[WS] Extension connection attempt');

      // Only accept one extension connection
      if (bridgeStore.isConnected()) {
        const state = bridgeStore.getState();
        console.error(`[WS] Extension already connected (state: ${state.status}), rejecting new connection`);
        ws.close(1000, 'Another extension is already connected');
        return;
      }

      console.error('[WS] Extension connection established, waiting for HELLO handshake');

      // Set timeout for HELLO message
      helloTimer = setTimeout(() => {
        console.error('[WS] HELLO timeout, closing connection');
        ws.close(1000, 'HELLO timeout');
      }, HELLO_TIMEOUT);
    },

    onMessage: (event: MessageEvent, ws: WSContext) => {
      try {
        const message = JSON.parse(event.data as string) as ExtMessage;

        // Handle HELLO message (handshake)
        if (message.type === 'HELLO') {
          // Clear timeout
          if (helloTimer) {
            clearTimeout(helloTimer);
            helloTimer = null;
          }

          // Check again if another connection was established while waiting
          if (bridgeStore.isConnected()) {
            console.error('[WS] Another extension connected during handshake, closing this connection');
            ws.close(1000, 'Another extension is already connected');
            return;
          }

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

    onClose: (event: CloseEvent, ws: WSContext) => {
      // Clear timeout if still pending
      if (helloTimer) {
        clearTimeout(helloTimer);
        helloTimer = null;
      }

      console.error(`[WS] Extension disconnected (code: ${event.code}, reason: ${event.reason || 'No reason'})`);
      bridgeStore.removeExtension(ws);
    },

    onError: (event: Event, ws: WSContext) => {
      console.error('[WS] WebSocket error:', event);
    },
  };
});
