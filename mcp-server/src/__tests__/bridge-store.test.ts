import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { BridgeStore } from '../bridge/store.js';

// Minimal WSContext mock
function createMockWs(readyState: number = 1) {
  const sent: string[] = [];
  return {
    send: (data: string) => { sent.push(data); },
    getSent: () => sent,
    readyState,
  } as unknown as import('hono/ws').WSContext & { getSent: () => string[] };
}

describe('BridgeStore', () => {
  let store: BridgeStore;

  beforeEach(() => {
    store = new BridgeStore();
  });

  describe('initial state', () => {
    it('should start as idle and not connected', () => {
      expect(store.isConnected()).toBe(false);
      expect(store.isReady()).toBe(false);
      expect(store.hasConnection()).toBe(false);
    });
  });

  describe('setExtension', () => {
    it('should become connected and ready after setExtension', () => {
      const ws = createMockWs();
      store.setExtension(ws);
      expect(store.isConnected()).toBe(true);
      expect(store.isReady()).toBe(true);
      expect(store.hasConnection()).toBe(true);
    });
  });

  describe('removeExtension', () => {
    it('should disconnect when the same ws is removed', () => {
      const ws = createMockWs();
      store.setExtension(ws);
      store.removeExtension(ws);
      expect(store.isConnected()).toBe(false);
      expect(store.isReady()).toBe(false);
    });

    it('should not disconnect when a different ws is removed', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      store.setExtension(ws1);
      store.removeExtension(ws2);
      expect(store.isConnected()).toBe(true);
    });
  });

  describe('sendRequest', () => {
    it('should throw when not connected', async () => {
      await expect(store.sendRequest({ action: 'test' })).rejects.toThrow('Browser extension not connected');
    });

    it('should send a request and resolve on response', async () => {
      const ws = createMockWs();
      store.setExtension(ws);

      const requestPromise = store.sendRequest({ action: 'test', params: {} });

      // Extract the request ID from the sent message
      const sent = (ws as any).getSent();
      expect(sent.length).toBe(1);
      const message = JSON.parse(sent[0]);
      expect(message.type).toBe('REQUEST');
      expect(message.id).toBeTruthy();

      // Simulate response
      store.resolveResponse(message.id, { result: 'ok' });

      const result = await requestPromise;
      expect(result).toEqual({ result: 'ok' });
    });

    it('should reject on error response', async () => {
      const ws = createMockWs();
      store.setExtension(ws);

      const requestPromise = store.sendRequest({ action: 'test' });

      const sent = (ws as any).getSent();
      const message = JSON.parse(sent[0]);

      store.rejectResponse(message.id, 'Something went wrong');

      await expect(requestPromise).rejects.toThrow('Something went wrong');
    });

    it('should reject pending requests on disconnect', async () => {
      const ws = createMockWs();
      store.setExtension(ws);

      const requestPromise = store.sendRequest({ action: 'test' });

      // Disconnect while request is pending
      store.removeExtension(ws);

      await expect(requestPromise).rejects.toThrow('Extension disconnected');
    });

    it('should queue requests when busy', async () => {
      const ws = createMockWs();
      store.setExtension(ws);

      // First request - makes store busy
      const req1 = store.sendRequest({ action: 'first' });

      // Second request - should be queued
      const req2 = store.sendRequest({ action: 'second' });

      const sent = (ws as any).getSent();
      expect(sent.length).toBe(1); // Only first request sent

      // Resolve first
      const msg1 = JSON.parse(sent[0]);
      store.resolveResponse(msg1.id, 'result1');
      await req1;

      // Second should now be sent
      expect(sent.length).toBe(2);
      const msg2 = JSON.parse(sent[1]);
      store.resolveResponse(msg2.id, 'result2');

      const result2 = await req2;
      expect(result2).toBe('result2');
    });

    it('should reject when queue is full', async () => {
      const ws = createMockWs();
      store.setExtension(ws);

      // Fill the queue (MAX_QUEUE_SIZE = 10, first request makes it busy)
      const requests: Promise<unknown>[] = [];
      requests.push(store.sendRequest({ action: 'first' })); // makes busy

      for (let i = 0; i < 10; i++) {
        requests.push(store.sendRequest({ action: `queued-${i}` }));
      }

      // 11th queued request should fail
      await expect(store.sendRequest({ action: 'overflow' })).rejects.toThrow('Request queue full');
    });
  });

  describe('resolveResponse', () => {
    it('should ignore unknown request IDs', () => {
      // Should not throw
      store.resolveResponse('unknown_id', { data: 'test' });
    });
  });

  describe('rejectResponse', () => {
    it('should ignore unknown request IDs', () => {
      // Should not throw
      store.rejectResponse('unknown_id', 'error message');
    });
  });

  describe('forceCleanup', () => {
    it('should disconnect and reject pending requests', async () => {
      const ws = createMockWs();
      store.setExtension(ws);

      const requestPromise = store.sendRequest({ action: 'test' });

      store.forceCleanup();

      expect(store.isConnected()).toBe(false);
      await expect(requestPromise).rejects.toThrow('Extension disconnected');
    });
  });
});
