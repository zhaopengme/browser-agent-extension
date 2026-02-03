// mcp-server/src/ws/handler.ts

import type { Context } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import type { WSContext } from 'hono/ws';
import { bridgeStore } from '../bridge/store.js';

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
        const data = JSON.parse(event.data as string);

        // Handle HELLO message (handshake)
        if (data.type === 'HELLO') {
          // Clear timeout
          if (helloTimer) {
            clearTimeout(helloTimer);
            helloTimer = null;
          }

          console.error(`[WS] Extension handshake completed, version: ${data.version}`);
          bridgeStore.setExtension(ws);
          return;
        }

        // Handle RESPONSE from extension
        // Extension format: { type: 'RESPONSE', id, payload: { success, data?, error? } }
        if (data.type === 'RESPONSE') {
          const payload = data.payload;
          // Check if payload has success field (new format) or is direct result (old format)
          if (payload && typeof payload === 'object' && 'success' in payload) {
            // New format with success flag
            if (payload.success) {
              bridgeStore.resolveResponse(data.id, payload.data);
            } else {
              bridgeStore.rejectResponse(data.id, payload.error || 'Unknown error');
            }
          } else {
            // Old format - payload is the result directly
            bridgeStore.resolveResponse(data.id, payload);
          }
          return;
        }

        // Handle ERROR from extension
        if (data.type === 'ERROR') {
          const errorMsg = data.payload?.error || data.error || 'Unknown error';
          bridgeStore.rejectResponse(data.id, errorMsg);
          return;
        }

        // Handle STATUS update
        if (data.type === 'STATUS') {
          console.error(`[WS] Extension status update: connected=${data.connected}`);
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
