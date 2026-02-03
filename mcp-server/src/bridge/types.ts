// mcp-server/src/bridge/types.ts

export type BridgeState =
  | { status: 'idle' }
  | { status: 'ready' }
  | { status: 'busy'; requestId: string };

export interface BridgeRequest {
  id: string;
  type: 'REQUEST' | 'PING';
  payload: unknown;
  timestamp: number;
}

export interface BridgeResponse {
  id: string;
  type: 'RESPONSE' | 'ERROR';
  payload?: unknown;
  error?: string;
}

// Messages from extension
export type ExtMessage =
  | { type: 'HELLO'; version: string }
  | { type: 'RESPONSE'; id: string; result: unknown }
  | { type: 'ERROR'; id: string; error: string }
  | { type: 'STATUS'; connected: boolean };

// Messages to extension
export type ServerMessage =
  | { type: 'REQUEST'; id: string; payload: unknown }
  | { type: 'PING' };

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}
