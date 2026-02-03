// mcp-server/src/ws/handler.ts

import type { Context } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import type { WSContext } from 'hono/ws';
import { bridgeStore } from '../bridge/store.js';
import type { ExtMessage } from '../bridge/types.js';

const HELLO_TIMEOUT = 10000; // 10 seconds to send HELLO

export const wsHandler = upgradeWebSocket((c: Context) => {
  let helloTimer: ReturnType<typeof setTimeout> | null = null;
  let thisWs: WSContext | null = null;

  return {
    onOpen: (event: Event, ws: WSContext) => {
      thisWs = ws;
      console.error('[WS] Extension connection attempt');

      // Force cleanup any existing connection before accepting new one
      // This handles cases where onClose was not triggered (browser refresh, etc.)
      if (bridgeStore.hasConnection()) {
        console.error('[WS] Cleaning up existing connection before accepting new one');
        bridgeStore.forceCleanup();
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
        console.error(`[WS] Received message: ${event.data}`);
        const message = JSON.parse(event.data as string) as ExtMessage;
        console.error(`[WS] Parsed message type: ${message.type}`);

        // Handle HELLO message (handshake)
        if (message.type === 'HELLO') {
          console.error(`[WS] HELLO received, checking if can accept...`);
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
          console.error(`[WS] Calling setExtension...`);
          bridgeStore.setExtension(ws);
          console.error(`[WS] setExtension called, state should be ready`);
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

      // Always try to remove - the store will check if it's the stored one
      bridgeStore.removeExtension(ws);
      thisWs = null;
    },

    onError: (event: Event, ws: WSContext) => {
      console.error('[WS] WebSocket error:', event);
    },
  };
});
