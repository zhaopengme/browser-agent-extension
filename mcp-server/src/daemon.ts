#!/usr/bin/env node
/**
 * Browser Agent Daemon
 *
 * Simplified daemon that:
 * - Manages Unix Socket server for MCP client connections
 * - Runs WebSocket server for browser extension connections
 * - Routes requests between MCP clients and extension
 * - Auto-exits after 60s of no active connections
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

// Configuration
const DEFAULT_SOCKET_PATH = process.env.XDG_RUNTIME_DIR
  ? path.join(process.env.XDG_RUNTIME_DIR, 'browser-agent-daemon.sock')
  : '/tmp/browser-agent-daemon.sock';
const SOCKET_PATH = process.env.BROWSER_AGENT_DAEMON_SOCKET || DEFAULT_SOCKET_PATH;
const PID_FILE = process.env.BROWSER_AGENT_DAEMON_PID || `${SOCKET_PATH}.pid`;
const WS_HOST = process.env.BROWSER_AGENT_WS_HOST || '0.0.0.0';
const WS_PORT = process.env.BROWSER_AGENT_WS_PORT ? parseInt(process.env.BROWSER_AGENT_WS_PORT) : 3026;
const IDLE_TIMEOUT = 60000; // 60 seconds
const REQUEST_TIMEOUT = 60000; // 60 seconds
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB
const LOG_FILE = process.env.BROWSER_AGENT_LOG_FILE || '/tmp/browser-agent.log';

// Types
interface PendingRequest {
  socket: net.Socket;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
}

interface DaemonMessage {
  type: 'REQUEST' | 'PING' | 'STATUS';
  id: string;
  action?: string;
  params?: Record<string, unknown>;
}

interface ExtensionMessage {
  type: 'HELLO' | 'RESPONSE';
  id?: string;
  payload?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

// Logging
function writeMcpLog(type: 'CALL' | 'DONE', action: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp} MCP_${type} action=${action}${details ? ' ' + JSON.stringify(details) : ''}\n`;
  try {
    fs.appendFileSync(LOG_FILE, logEntry, 'utf8');
  } catch (error) {
    console.error(`[Daemon] Failed to write MCP log:`, error);
  }
}

// State
const pendingRequests = new Map<string, PendingRequest>();
let extensionWs: WebSocket | null = null;
let extensionReady = false;

let unixServer: net.Server | null = null;
let wsServer: WebSocketServer | null = null;
let idleTimer: NodeJS.Timeout | null = null;

/**
 * Check if extension WebSocket is connected and ready
 */
function isExtensionConnected(): boolean {
  return extensionWs !== null && extensionWs.readyState === WebSocket.OPEN && extensionReady;
}

/**
 * Reset idle timer
 */
function resetIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }

  idleTimer = setTimeout(() => {
    console.error('[Daemon] No active connections for 60s, shutting down...');
    shutdown();
  }, IDLE_TIMEOUT);
}

function ensureSocketDir(): void {
  const socketDir = path.dirname(SOCKET_PATH);
  try {
    fs.mkdirSync(socketDir, { recursive: true, mode: 0o700 });
  } catch (error) {
    console.error(`[Daemon] Failed to create socket dir: ${socketDir}`, error);
    process.exit(1);
  }

  try {
    fs.accessSync(socketDir, fs.constants.W_OK);
  } catch (error) {
    console.error(`[Daemon] Socket dir not writable: ${socketDir}. Set BROWSER_AGENT_DAEMON_SOCKET to a writable path.`);
    process.exit(1);
  }
}

/**
 * Start WebSocket server for extension connections
 */
function startWebSocketServer(): void {
  wsServer = new WebSocketServer({ host: WS_HOST, port: WS_PORT });

  wsServer.on('listening', () => {
    console.error(`[Daemon] WebSocket server listening on ${WS_HOST}:${WS_PORT}`);
  });

  wsServer.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.error(`[Daemon] Extension connected from ${clientIp}`);

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as ExtensionMessage;

        // Handle HELLO message from extension (handshake)
        if (message.type === 'HELLO') {
          extensionReady = true;
          console.error('[Daemon] Extension handshake completed, ready to accept requests');
          return;
        }

        // Handle RESPONSE from extension
        if (message.type === 'RESPONSE' && message.id) {
          const pending = pendingRequests.get(message.id);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingRequests.delete(message.id);

            if (message.payload?.success) {
              pending.resolve(message.payload.data);
            } else {
              pending.reject(new Error(message.payload?.error || 'Unknown error'));
            }
          }
        }
      } catch (error) {
        console.error('[Daemon] Failed to parse extension message:', error);
      }
    });

    ws.on('close', () => {
      console.error('[Daemon] Extension disconnected');

      if (extensionWs === ws) {
        extensionWs = null;
        extensionReady = false;
      }

      // Clear all pending requests
      for (const [id, pending] of pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Extension disconnected'));
      }
      pendingRequests.clear();
    });

    ws.on('error', (error) => {
      console.error('[Daemon] WebSocket error:', error);
    });

    // Use this as the extension connection
    if (!extensionWs || extensionWs.readyState !== WebSocket.OPEN) {
      extensionWs = ws;
      extensionReady = false;
    }
  });

  wsServer.on('error', (error) => {
    console.error('[Daemon] WebSocket server error:', error);
  });
}

/**
 * Send request to browser extension
 */
function sendToExtension(requestId: string, action: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!extensionWs || extensionWs.readyState !== WebSocket.OPEN) {
      reject(new Error('Browser extension not connected'));
      return;
    }

    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Request timeout: ${action}`));
    }, REQUEST_TIMEOUT);

    pendingRequests.set(requestId, { socket: pendingRequests.get(requestId)?.socket!, resolve, reject, timeout });

    const request = {
      type: 'REQUEST',
      id: requestId,
      action,
      params,
    };

    extensionWs.send(JSON.stringify(request));
  });
}

/**
 * Send message to MCP client
 */
function sendToClient(socket: net.Socket, message: object): void {
  try {
    socket.write(JSON.stringify(message) + '\n');
  } catch (error) {
    console.error('[Daemon] Failed to send message to client:', error);
  }
}

/**
 * Handle REQUEST message
 */
async function handleRequest(socket: net.Socket, message: DaemonMessage): Promise<void> {
  const { id, action, params } = message;

  if (!action) {
    sendToClient(socket, {
      type: 'RESPONSE',
      id,
      payload: { success: false, error: 'Missing action' },
    });
    return;
  }

  // Store socket reference for response routing
  const timeout = setTimeout(() => {
    pendingRequests.delete(id);
  }, REQUEST_TIMEOUT);

  pendingRequests.set(id, {
    socket,
    resolve: () => {},
    reject: () => {},
    timeout,
  });

  // Update the pending request with actual resolve/reject
  const promise = new Promise<unknown>((resolve, reject) => {
    const pending = pendingRequests.get(id);
    if (pending) {
      pending.resolve = resolve;
      pending.reject = reject;
    }
  });

  // Log MCP call
  writeMcpLog('CALL', action, params ? { params } : undefined);
  const startTime = Date.now();

  try {
    const result = await sendToExtension(id, action, params);
    const duration = Date.now() - startTime;

    writeMcpLog('DONE', action, { duration, success: true });

    sendToClient(socket, {
      type: 'RESPONSE',
      id,
      payload: { success: true, data: result },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    writeMcpLog('DONE', action, { duration, success: false, error: errorMessage });

    sendToClient(socket, {
      type: 'RESPONSE',
      id,
      payload: { success: false, error: errorMessage },
    });
  } finally {
    pendingRequests.delete(id);
  }

  resetIdleTimer();
}

/**
 * Handle PING message
 */
function handlePing(socket: net.Socket, message: DaemonMessage): void {
  sendToClient(socket, {
    type: 'PONG',
    id: message.id,
  });
}

/**
 * Handle STATUS message
 */
function handleStatus(socket: net.Socket, message: DaemonMessage): void {
  sendToClient(socket, {
    type: 'STATUS_OK',
    id: message.id,
    extensionConnected: isExtensionConnected(),
  });
}

/**
 * Handle client connection
 */
function handleClientConnection(socket: net.Socket): void {
  console.error('[Daemon] MCP client connected');

  let buffer = '';

  socket.on('data', (data) => {
    buffer += data.toString();

    // Check buffer size
    if (buffer.length > MAX_BUFFER_SIZE) {
      console.error('[Daemon] Buffer overflow, closing connection');
      socket.destroy();
      return;
    }

    // Process complete messages (newline-delimited)
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (line.trim()) {
        try {
          const message = JSON.parse(line) as DaemonMessage;

          switch (message.type) {
            case 'REQUEST':
              handleRequest(socket, message);
              break;
            case 'PING':
              handlePing(socket, message);
              break;
            case 'STATUS':
              handleStatus(socket, message);
              break;
            default:
              console.error('[Daemon] Unknown message type:', message.type);
          }
        } catch (error) {
          console.error('[Daemon] Failed to parse client message:', error);
        }
      }
    }
  });

  socket.on('close', () => {
    console.error('[Daemon] MCP client disconnected');

    // Clear pending requests from this socket
    for (const [id, pending] of pendingRequests) {
      if (pending.socket === socket) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Client disconnected'));
        pendingRequests.delete(id);
      }
    }

    resetIdleTimer();
  });

  socket.on('error', (error) => {
    console.error('[Daemon] Client socket error:', error);
  });
}

/**
 * Start Unix Socket server
 */
function startUnixServer(): void {
  ensureSocketDir();
  // Remove existing socket file if it exists
  if (fs.existsSync(SOCKET_PATH)) {
    try {
      fs.unlinkSync(SOCKET_PATH);
    } catch (error) {
      console.error('[Daemon] Failed to remove existing socket:', error);
      process.exit(1);
    }
  }

  unixServer = net.createServer(handleClientConnection);

  unixServer.listen(SOCKET_PATH, () => {
    console.error(`[Daemon] Unix Socket server listening on ${SOCKET_PATH}`);

    // Set socket permissions to owner-only (0600)
    try {
      fs.chmodSync(SOCKET_PATH, 0o600);
    } catch (error) {
      console.error('[Daemon] Failed to set socket permissions:', error);
    }
  });

  unixServer.on('error', (error) => {
    console.error('[Daemon] Unix Socket server error:', error);
    process.exit(1);
  });
}

/**
 * Write PID file
 */
function writePidFile(): void {
  try {
    fs.writeFileSync(PID_FILE, process.pid.toString());
  } catch (error) {
    console.error('[Daemon] Failed to write PID file:', error);
  }
}

/**
 * Remove PID file
 */
function removePidFile(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch (error) {
    console.error('[Daemon] Failed to remove PID file:', error);
  }
}

/**
 * Shutdown daemon
 */
function shutdown(): void {
  console.error('[Daemon] Shutting down...');

  // Clear idle timer
  if (idleTimer) {
    clearTimeout(idleTimer);
  }

  // Clear all pending requests
  for (const [id, pending] of pendingRequests) {
    clearTimeout(pending.timeout);
    pending.reject(new Error('Daemon shutting down'));
  }
  pendingRequests.clear();

  // Close WebSocket server
  if (wsServer) {
    wsServer.close(() => {
      console.error('[Daemon] WebSocket server closed');
    });
  }

  // Close extension connection
  if (extensionWs) {
    try {
      extensionWs.close();
    } catch (error) {
      console.error('[Daemon] Failed to close extension connection:', error);
    }
    extensionWs = null;
  }

  // Close Unix Socket server
  if (unixServer) {
    unixServer.close(() => {
      console.error('[Daemon] Unix Socket server closed');
    });
  }

  // Remove socket file
  if (fs.existsSync(SOCKET_PATH)) {
    try {
      fs.unlinkSync(SOCKET_PATH);
    } catch (error) {
      console.error('[Daemon] Failed to remove socket file:', error);
    }
  }

  // Remove PID file
  removePidFile();

  // Exit
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

/**
 * Main function
 */
export function runDaemon(options: { dryRun?: boolean } = {}): void {
  if (options.dryRun) {
    return;
  }

  console.error('[Daemon] Browser Agent Daemon starting...');

  // Write PID file
  writePidFile();

  // Register signal handlers
  process.on('SIGINT', () => {
    console.error('[Daemon] Received SIGINT');
    shutdown();
  });

  process.on('SIGTERM', () => {
    console.error('[Daemon] Received SIGTERM');
    shutdown();
  });

  // Start Unix Socket server for MCP clients
  startUnixServer();

  // Start WebSocket server for extension connections
  startWebSocketServer();

  // Start idle timer
  resetIdleTimer();

  // Start memory stats logging (every 5 minutes)
  setInterval(() => {
    console.error(`[MemoryStats] Pending requests: ${pendingRequests.size}, Extension connected: ${isExtensionConnected()}`);
  }, 300000);

  console.error('[Daemon] Daemon started successfully');
}

if (import.meta.main) {
  runDaemon();
}
