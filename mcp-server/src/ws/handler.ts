// mcp-server/src/ws/handler.ts

import type { Context } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import type { WSContext } from 'hono/ws';
import { bridgeStore } from '../bridge/store.js';
import type { ExtMessage, ExtResponsePayload } from '../bridge/types.js';

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
        const data = JSON.parse(event.data as string) as ExtMessage | { type: 'RESPONSE'; id: string; payload: ExtResponsePayload };

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
        // Extension can send in two formats:
        // 1. Direct: { type: 'RESPONSE', id, payload: result }
        // 2. Wrapped: { type: 'RESPONSE', id, payload: { __format__: 'wrapped', success, data?, error? } }
        if (data.type === 'RESPONSE') {
          const payload = data.payload;

          // Type guard to check if it's wrapped format
          const isWrappedFormat = (p: unknown): p is ExtResponsePayload => {
            return p !== null &&
                   typeof p === 'object' &&
                   '__format__' in p &&
                   (p as Record<string, unknown>).__format__ === 'wrapped';
          };

          if (isWrappedFormat(payload)) {
            // Wrapped format with explicit format identifier
            if (payload.success) {
              bridgeStore.resolveResponse(data.id, payload.data);
            } else {
              bridgeStore.rejectResponse(data.id, payload.error || 'Unknown error');
            }
          } else {
            // Direct format - payload is the result
            bridgeStore.resolveResponse(data.id, payload);
          }
          return;
        }

        // Handle ERROR from extension
        if (data.type === 'ERROR') {
          const errorMsg = data.error || 'Unknown error';
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
