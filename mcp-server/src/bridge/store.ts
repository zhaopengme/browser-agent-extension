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
    // Check both state and actual WebSocket readyState
    if (this.state.status === 'idle' || this.extensionWs === null) {
      return false;
    }
    // Verify the WebSocket is actually open (readyState === 1)
    const ws = this.extensionWs as unknown as WebSocket;
    if (ws.readyState !== 1) {
      // Connection is dead, clean it up
      this.extensionWs = null;
      this.state = { status: 'idle' };
      return false;
    }
    return true;
  }

  isReady(): boolean {
    return this.state.status === 'ready';
  }

  setExtension(ws: WSContext): void {
    this.extensionWs = ws;
    this.state = { status: 'ready' };
  }

  removeExtension(ws: WSContext): void {
    if (this.extensionWs === ws) {
      console.error('[BridgeStore] Removing extension connection');
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
