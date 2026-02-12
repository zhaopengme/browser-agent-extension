// mcp-server/src/bridge/store.ts

import type { WSContext } from 'hono/ws';
import { logger } from '../utils/logger.js';
import type { BridgeState, PendingRequest, ServerMessage } from './types.js';

interface QueuedRequest {
  payload: unknown;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeoutMs?: number;
}

export class BridgeStore {
  private state: BridgeState = { status: 'idle' };
  private pendingRequests = new Map<string, PendingRequest>();
  private requestQueue: QueuedRequest[] = [];
  private extensionWs: WSContext | null = null;
  private requestIdCounter = 0;
  private processingQueue = false;

  private readonly DEFAULT_REQUEST_TIMEOUT = 60000; // 60 seconds
  private readonly MAX_REQUEST_TIMEOUT = 300000; // 5 minutes safety cap
  private readonly MAX_QUEUE_SIZE = 10;

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
      logger.warn('BridgeStore', `Rejecting ${this.pendingRequests.size} pending requests due to disconnect`);
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Extension disconnected'));
      }
      this.pendingRequests.clear();
    }

    // Reject all queued requests
    if (this.requestQueue.length > 0) {
      logger.warn('BridgeStore', `Rejecting ${this.requestQueue.length} queued requests due to disconnect`);
      for (const queued of this.requestQueue) {
        queued.reject(new Error('Extension disconnected'));
      }
      this.requestQueue = [];
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
      logger.warn('BridgeStore', 'Dead connection detected, cleaning up');
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
    logger.info('BridgeStore', 'Force cleanup of connection');
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
      logger.info('BridgeStore', 'Removing extension connection');
      this.cleanup();
    } else {
      logger.warn('BridgeStore', 'removeExtension called but ws does not match stored extension');
    }
  }

  private nextRequestId(): string {
    const now = Date.now();
    return 'req_' + (++this.requestIdCounter) + '_' + now;
  }

  async sendRequest(payload: unknown, timeoutMs?: number): Promise<unknown> {
    if (this.state.status === 'idle') {
      throw new Error('Browser extension not connected');
    }

    // If busy, queue the request
    if (this.state.status === 'busy') {
      if (this.requestQueue.length >= this.MAX_QUEUE_SIZE) {
        throw new Error(`Request queue full (max ${this.MAX_QUEUE_SIZE})`);
      }
      logger.info('BridgeStore', `Queueing request, queue size: ${this.requestQueue.length + 1}`);
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ payload, resolve, reject, timeoutMs });
      });
    }

    if (!this.extensionWs) {
      throw new Error('Browser extension not connected');
    }

    return this.executeRequest(payload, timeoutMs);
  }

  private async executeRequest(payload: unknown, timeoutMs?: number): Promise<unknown> {
    const id = this.nextRequestId();
    const effectiveTimeout = Math.min(
      timeoutMs ?? this.DEFAULT_REQUEST_TIMEOUT,
      this.MAX_REQUEST_TIMEOUT
    );

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.state = { status: 'ready' };
        reject(new Error(`Request timeout (${effectiveTimeout}ms)`));
        // Process next request in queue
        this.processQueue();
      }, effectiveTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.state = { status: 'busy', requestId: id };

      const message: ServerMessage = {
        type: 'REQUEST',
        id,
        payload,
      };

      if (logger.isDebugEnabled()) {
        logger.debug('BridgeStore', `Sending request ${id}: action=${(payload as Record<string, unknown>)?.action ?? 'unknown'}`);
      }
      this.extensionWs!.send(JSON.stringify(message));
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.requestQueue.length === 0) return;
    if (this.state.status !== 'ready') return;

    this.processingQueue = true;

    while (this.requestQueue.length > 0 && this.state.status === 'ready') {
      const next = this.requestQueue.shift()!;
      try {
        const result = await this.executeRequest(next.payload, next.timeoutMs);
        next.resolve(result);
      } catch (error) {
        next.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.processingQueue = false;
  }

  resolveResponse(id: string, result: unknown): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      this.state = { status: 'ready' };
      pending.resolve(result);
      // Process next request in queue
      this.processQueue();
    } else {
      logger.warn('BridgeStore', `Received response for unknown/expired request: ${id}`);
    }
  }

  rejectResponse(id: string, error: string): void {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      this.state = { status: 'ready' };
      pending.reject(new Error(error));
      // Process next request in queue
      this.processQueue();
    } else {
      logger.warn('BridgeStore', `Received error for unknown/expired request: ${id}`);
    }
  }
}

export const bridgeStore = new BridgeStore();
