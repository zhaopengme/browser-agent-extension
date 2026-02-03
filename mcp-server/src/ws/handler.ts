// mcp-server/src/ws/handler.ts

import type { Context } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import type { WSContext } from 'hono/ws';
import { bridgeStore } from '../bridge/store.js';
import type { ExtMessage } from '../bridge/types.js';

const HELLO_TIMEOUT = 10000; // 10 seconds to send HELLO

export const wsHandler = upgradeWebSocket((c: Context) => {
  let helloTimer: ReturnType<typeof setTimeout> | null = null;
  let isAccepted = false; // Track if this connection was accepted

  return {
    onOpen: (event: Event, ws: WSContext) => {
      console.error('[WS] Extension connection attempt');

      // If there's an existing connection, we will replace it
      // This handles cases where the old connection is dead but not cleaned up
      if (bridgeStore.isConnected()) {
        console.error('[WS] Replacing existing extension connection');
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

          console.error(`[WS] Extension handshake completed, version: ${message.version}`);
          isAccepted = true; // Mark this connection as accepted

          // Force replace any existing connection
          bridgeStore.setExtension(ws, true);
          return;
        }

        // Only process other messages if connection is accepted
        if (!isAccepted) {
          console.error('[WS] Received message before HELLO, ignoring');
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

      // Only remove from store if this was an accepted connection
      if (isAccepted) {
        console.error(`[WS] Extension disconnected (code: ${event.code}, reason: ${event.reason || 'No reason'})`);
        bridgeStore.removeExtension(ws);
      } else {
        // Connection was never accepted (rejected or HELLO timeout)
        console.error(`[WS] Rejected connection closed (code: ${event.code}, reason: ${event.reason || 'No reason'})`);
      }
    },

    onError: (event: Event, ws: WSContext) => {
      console.error('[WS] WebSocket error:', event);
    },
  };
});
