// mcp-server/src/bridge/store.ts

import type { WSContext } from 'hono/ws';
import type { BridgeState, PendingRequest, ServerMessage } from './types.js';

export class BridgeStore {
  private state: BridgeState = { status: 'idle' };
  private pendingRequests = new Map<string, PendingRequest>();
  private extensionWs: WSContext | null = null;
  private requestIdCounter = 0;

  private readonly REQUEST_TIMEOUT = 60000; // 60 seconds

  getState(): BridgeState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state.status !== 'idle' && this.extensionWs !== null;
  }

  private cleanup(): void {
    this.extensionWs = null;
    this.state = { status: 'idle' };

    // Reject all pending requests
    if (this.pendingRequests.size > 0) {
      console.error(`[BridgeStore] Rejecting ${this.pendingRequests.size} pending requests`);
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Extension disconnected'));
      }
      this.pendingRequests.clear();
    }
  }

  /**
   * Try to ping the existing connection, clean it up if it fails
   */
  async checkAndCleanupDeadConnection(): Promise<boolean> {
    if (this.extensionWs === null || this.state.status === 'idle') {
      return false; // No connection to check
    }

    const ws = this.extensionWs as unknown as WebSocket;
    if (ws.readyState !== 1) {
      console.error('[BridgeStore] Dead connection detected, cleaning up');
      this.cleanup();
      return false;
    }

    // Connection appears to be alive
    return true;
  }

  isReady(): boolean {
    return this.state.status === 'ready';
  }

  /**
   * Check if there's a stored connection (regardless of readyState)
   */
  hasConnection(): boolean {
    return this.extensionWs !== null && this.state.status !== 'idle';
  }

  /**
   * Force cleanup - use when we know the connection is dead
   */
  forceCleanup(): void {
    console.error('[BridgeStore] Force cleanup of connection');
    // Try to close the old connection if possible
    if (this.extensionWs) {
      try {
        const ws = this.extensionWs as unknown as WebSocket;
        if (ws.readyState === 1) {
          ws.close(1000, 'Replaced by new connection');
        }
      } catch {
        // Ignore errors
      }
    }
    this.cleanup();
  }

  setExtension(ws: WSContext): void {
    this.extensionWs = ws;
    this.state = { status: 'ready' };
  }

  removeExtension(ws: WSContext): void {
    if (this.extensionWs === ws) {
      console.error('[BridgeStore] Removing extension connection');
      this.cleanup();
    } else {
      console.error('[BridgeStore] removeExtension called but ws does not match stored extension');
    }
  }

  private nextRequestId(): string {
    const now = Date.now();
    return 'req_' + (++this.requestIdCounter) + '_' + now;
  }

  async sendRequest(payload: unknown): Promise<unknown> {
    if (this.state.status === 'idle') {
      throw new Error('Browser extension not connected');
    }

    if (this.state.status === 'busy') {
      throw new Error('Browser busy processing another request');
    }

    if (!this.extensionWs) {
      throw new Error('Browser extension not connected');
    }

    const id = this.nextRequestId();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.state = { status: 'ready' };
        reject(new Error('Request timeout'));
      }, this.REQUEST_TIMEOUT);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.state = { status: 'busy', requestId: id };

      const message: ServerMessage = {
        type: 'REQUEST',
        id,
        payload,
      };

      this.extensionWs!.send(JSON.stringify(message));
    });
  }

  resolveResponse(id: string, result: unknown): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      this.state = { status: 'ready' };
      pending.resolve(result);
    }
  }

  rejectResponse(id: string, error: string): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      this.state = { status: 'ready' };
      pending.reject(new Error(error));
    }
  }
}

export const bridgeStore = new BridgeStore();
