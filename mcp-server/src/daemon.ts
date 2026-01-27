#!/usr/bin/env node
/**
 * Browser Agent Daemon
 *
 * Multi-client session support daemon that:
 * - Manages Unix Socket server for MCP client connections
 * - Runs WebSocket server for browser extension connections
 * - Routes requests between multiple MCP clients and extensions
 * - Tracks session-to-tab bindings
 * - Auto-exits after 60s of no active sessions
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
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
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_SESSIONS = 100;
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB

// Types
interface Session {
  id: string;
  socket: net.Socket;
  createdAt: number;
  lastActiveAt: number;
}

interface PendingRequest {
  sessionId: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
}

interface DaemonMessage {
  type: 'REGISTER' | 'REQUEST' | 'PING' | 'DISCONNECT' | 'STATUS';
  id: string;
  sessionId?: string;
  action?: string;
  params?: Record<string, unknown>;
}

interface ExtensionMessage {
  type: 'RESPONSE' | 'SESSION_START' | 'SESSION_END';
  id?: string;
  sessionId: string;
  payload?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

// State
const sessions = new Map<string, Session>();
const pendingRequests = new Map<string, PendingRequest>();

// WebSocket connections from extensions (key: sessionId, value: WebSocket)
// For simplicity, we assume one extension connection per session
const extensionConnections = new Map<string, WebSocket>();

// Shared extension connection (when multiple sessions share one extension)
let sharedExtensionWs: WebSocket | null = null;

let unixServer: net.Server | null = null;
let wsServer: WebSocketServer | null = null;
let idleTimer: NodeJS.Timeout | null = null;

/**
 * Check if any extension WebSocket is connected
 */
function isExtensionConnected(): boolean {
  if (sharedExtensionWs && sharedExtensionWs.readyState === WebSocket.OPEN) {
    return true;
  }

  for (const ws of extensionConnections.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      return true;
    }
  }

  return false;
}

/**
 * Generate a random session ID
 */
function generateSessionId(): string {
  return 'sess_' + crypto.randomBytes(16).toString('hex');
}

/**
 * Reset idle timer
 */
function resetIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }

  idleTimer = setTimeout(() => {
    if (sessions.size === 0) {
      console.error('[Daemon] No active sessions for 60s, shutting down...');
      shutdown();
    }
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
    // Get the IP address of the connected client
    const clientIp = req.socket.remoteAddress;
    console.error(`[Daemon] Extension connected from ${clientIp}`);

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as ExtensionMessage;

        // Handle different message types from extension
        if (message.type === 'RESPONSE' && message.id) {
          const pending = pendingRequests.get(message.id);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingRequests.delete(message.id);

            // Update session last active time
            const session = sessions.get(pending.sessionId);
            if (session) {
              session.lastActiveAt = Date.now();
            }

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

      // Clear extension connections
      for (const [sessionId, extWs] of extensionConnections) {
        if (extWs === ws) {
          extensionConnections.delete(sessionId);
        }
      }

      if (sharedExtensionWs === ws) {
        sharedExtensionWs = null;
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

    // Use this as the shared extension connection
    if (!sharedExtensionWs) {
      sharedExtensionWs = ws;
    }
  });

  wsServer.on('error', (error) => {
    console.error('[Daemon] WebSocket server error:', error);
  });
}

/**
 * Send request to browser extension
 */
function sendToExtension(sessionId: string, requestId: string, action: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Try session-specific extension connection first
    let ws = extensionConnections.get(sessionId);

    // Fall back to shared extension connection
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      ws = sharedExtensionWs ?? undefined;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Browser extension not connected'));
      return;
    }

    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Request timeout: ${action}`));
    }, REQUEST_TIMEOUT);

    pendingRequests.set(requestId, { sessionId, resolve, reject, timeout });

    const request = {
      type: 'REQUEST',
      id: requestId,
      sessionId,
      action,
      params,
    };

    ws.send(JSON.stringify(request));
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
 * Handle REGISTER message
 */
function handleRegister(socket: net.Socket, message: DaemonMessage): void {
  // Check session limit
  if (sessions.size >= MAX_SESSIONS) {
    console.error(`[Daemon] Maximum session limit (${MAX_SESSIONS}) reached`);
    sendToClient(socket, {
      type: 'REGISTER_ERROR',
      id: message.id,
      error: `Maximum session limit (${MAX_SESSIONS}) reached. Please close some sessions.`
    });
    socket.end();
    return;
  }

  const sessionId = generateSessionId();

  const session: Session = {
    id: sessionId,
    socket,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };

  sessions.set(sessionId, session);
  console.error(`[Daemon] Session registered: ${sessionId} (total: ${sessions.size})`);

  // Send SESSION_START notification to extension
  if (sharedExtensionWs && sharedExtensionWs.readyState === WebSocket.OPEN) {
    sharedExtensionWs.send(JSON.stringify({
      type: 'SESSION_START',
      sessionId,
    }));
  }

  sendToClient(socket, {
    type: 'REGISTER_OK',
    id: message.id,
    sessionId,
  });

  resetIdleTimer();
}

/**
 * Handle REQUEST message
 */
async function handleRequest(socket: net.Socket, message: DaemonMessage): Promise<void> {
  const { id, sessionId, action, params } = message;

  if (!sessionId) {
    sendToClient(socket, {
      type: 'RESPONSE',
      id,
      payload: { success: false, error: 'Missing sessionId' },
    });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    sendToClient(socket, {
      type: 'RESPONSE',
      id,
      sessionId,
      payload: { success: false, error: 'Invalid session' },
    });
    return;
  }

  if (!action) {
    sendToClient(socket, {
      type: 'RESPONSE',
      id,
      sessionId,
      payload: { success: false, error: 'Missing action' },
    });
    return;
  }

  try {
    const result = await sendToExtension(sessionId, id, action, params);
    sendToClient(socket, {
      type: 'RESPONSE',
      id,
      sessionId,
      payload: { success: true, data: result },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendToClient(socket, {
      type: 'RESPONSE',
      id,
      sessionId,
      payload: { success: false, error: errorMessage },
    });
  }
}

/**
 * Handle PING message
 */
function handlePing(socket: net.Socket, message: DaemonMessage): void {
  const { id, sessionId } = message;

  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = Date.now();
    }
  }

  sendToClient(socket, {
    type: 'PONG',
    id,
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
    activeSessions: sessions.size,
  });
}

/**
 * Handle DISCONNECT message
 */
function handleDisconnect(socket: net.Socket, message: DaemonMessage): void {
  const { sessionId } = message;

  if (!sessionId) {
    return;
  }

  const session = sessions.get(sessionId);
  if (session) {
    sessions.delete(sessionId);
    console.error(`[Daemon] Session disconnected: ${sessionId} (remaining: ${sessions.size})`);

    // Send SESSION_END to extension
    if (sharedExtensionWs && sharedExtensionWs.readyState === WebSocket.OPEN) {
      sharedExtensionWs.send(JSON.stringify({
        type: 'SESSION_END',
        sessionId,
      }));
    }

    // Remove session-specific extension connection
    extensionConnections.delete(sessionId);

    // Clear pending requests for this session
    for (const [id, pending] of pendingRequests) {
      if (pending.sessionId === sessionId) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Session disconnected'));
        pendingRequests.delete(id);
      }
    }

    resetIdleTimer();
  }
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
            case 'REGISTER':
              handleRegister(socket, message);
              break;
            case 'REQUEST':
              handleRequest(socket, message);
              break;
            case 'PING':
              handlePing(socket, message);
              break;
            case 'STATUS':
              handleStatus(socket, message);
              break;
            case 'DISCONNECT':
              handleDisconnect(socket, message);
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

    // Find and remove session for this socket
    for (const [sessionId, session] of sessions) {
      if (session.socket === socket) {
        sessions.delete(sessionId);
        console.error(`[Daemon] Session removed: ${sessionId} (remaining: ${sessions.size})`);

        // Send SESSION_END to extension
        if (sharedExtensionWs && sharedExtensionWs.readyState === WebSocket.OPEN) {
          sharedExtensionWs.send(JSON.stringify({
            type: 'SESSION_END',
            sessionId,
          }));
        }

        // Remove session-specific extension connection
        extensionConnections.delete(sessionId);

        // Clear pending requests for this session
        for (const [id, pending] of pendingRequests) {
          if (pending.sessionId === sessionId) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Client disconnected'));
            pendingRequests.delete(id);
          }
        }

        break;
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

  // Close all client connections
  for (const [sessionId, session] of sessions) {
    try {
      session.socket.end();
    } catch (error) {
      console.error(`[Daemon] Failed to close session ${sessionId}:`, error);
    }
  }
  sessions.clear();

  // Close WebSocket server
  if (wsServer) {
    wsServer.close(() => {
      console.error('[Daemon] WebSocket server closed');
    });
  }

  // Close all extension connections
  for (const [sessionId, ws] of extensionConnections) {
    try {
      ws.close();
    } catch (error) {
      console.error(`[Daemon] Failed to close extension connection for ${sessionId}:`, error);
    }
  }
  extensionConnections.clear();

  if (sharedExtensionWs) {
    try {
      sharedExtensionWs.close();
    } catch (error) {
      console.error('[Daemon] Failed to close shared extension connection:', error);
    }
    sharedExtensionWs = null;
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

  console.error('[Daemon] Daemon started successfully');
}

if (import.meta.main) {
  runDaemon();
}
