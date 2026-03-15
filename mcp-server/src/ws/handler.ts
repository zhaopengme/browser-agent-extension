// mcp-server/src/ws/handler.ts

import type { Context } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import type { WSContext } from 'hono/ws';
import { logger } from '../utils/logger.js';
import { bridgeStore } from '../bridge/store.js';
import type { ExtMessage, ExtResponsePayload } from '../bridge/types.js';

const HELLO_TIMEOUT = parseInt(process.env.HELLO_TIMEOUT || '10000', 10);

// Connection lock to prevent race conditions during connection establishment
let connectionLock: Promise<void> | null = null;

export const wsHandler = upgradeWebSocket((c: Context) => {
  let helloTimer: ReturnType<typeof setTimeout> | null = null;
  return {
    onOpen: async (event: Event, ws: WSContext) => {
      logger.info('WS', 'Extension connection attempt');

      // Acquire lock to prevent race conditions
      while (connectionLock) {
        try {
          await connectionLock;
        } catch {
          // Ignore errors from previous lock
        }
      }

      // Create new lock
      let lockResolve: () => void;
      connectionLock = new Promise((resolve) => {
        lockResolve = resolve;
      });

      try {
        // Force cleanup any existing connection before accepting new one
        // This handles cases where onClose was not triggered (browser refresh, etc.)
        if (bridgeStore.hasConnection()) {
          logger.warn('WS', 'Cleaning up existing connection before accepting new one');
          bridgeStore.forceCleanup();
        }

        logger.info('WS', 'Extension connection established, waiting for HELLO handshake');
      } finally {
        // Release lock
        lockResolve!();
        connectionLock = null;
      }

      // Set timeout for HELLO message
      helloTimer = setTimeout(() => {
        logger.warn('WS', 'HELLO timeout, closing connection');
        ws.close(1001, 'HELLO timeout');
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

          logger.info('WS', `Extension handshake completed, version: ${data.version}`);
          bridgeStore.setExtension(ws);
          logger.info('BridgeStore', 'Extension connection ready');
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
          logger.debug('WS', `Extension status update: connected=${data.connected}`);
          return;
        }
      } catch (error) {
        logger.error('WS', 'Failed to parse extension message', error);
      }
    },

    onClose: (event: CloseEvent, ws: WSContext) => {
      // Clear timeout if still pending
      if (helloTimer) {
        clearTimeout(helloTimer);
        helloTimer = null;
      }

      logger.info('WS', `Extension disconnected (code: ${event.code}, reason: ${event.reason || 'No reason'})`);

      // Always try to remove - the store will check if it's the stored one
      bridgeStore.removeExtension(ws);
    },

    onError: (event: Event, ws: WSContext) => {
      logger.error('WS', 'WebSocket error', event);

      // Clear HELLO timer if still pending
      if (helloTimer) {
        clearTimeout(helloTimer);
        helloTimer = null;
      }

      // Clean up bridge in case onClose doesn't fire
      bridgeStore.removeExtension(ws);
    },
  };
});
