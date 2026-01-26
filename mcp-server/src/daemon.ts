#!/usr/bin/env node
/**
 * Browser Agent Daemon
 *
 * Multi-client session support daemon that:
 * - Manages Unix Socket server for MCP client connections
 * - Maintains WebSocket connection to browser extension
 * - Routes requests between multiple MCP clients and extension
 * - Tracks session-to-tab bindings
 * - Auto-exits after 60s of no active sessions
 */

import * as net from 'net';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { WebSocket } from 'ws';

// Configuration
const SOCKET_PATH = '/tmp/browser-agent-daemon.sock';
const PID_FILE = '/tmp/browser-agent-daemon.pid';
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
  type: 'REGISTER' | 'REQUEST' | 'PING' | 'DISCONNECT';
  id: string;
  sessionId?: string;
  action?: string;
  params?: Record<string, unknown>;
}

interface ExtensionMessage {
  type: 'RESPONSE';
  id: string;
  sessionId: string;
  payload: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

// State
const sessions = new Map<string, Session>();
const pendingRequests = new Map<string, PendingRequest>();
let extensionWs: WebSocket | null = null;
let unixServer: net.Server | null = null;
let idleTimer: NodeJS.Timeout | null = null;

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

/**
 * Connect to browser extension via WebSocket
 */
function connectToExtension(): void {
  if (extensionWs && extensionWs.readyState === WebSocket.OPEN) {
    return;
  }

  console.error(`[Daemon] Connecting to browser extension on port ${WS_PORT}...`);

  extensionWs = new WebSocket(`ws://localhost:${WS_PORT}`);

  extensionWs.on('open', () => {
    console.error('[Daemon] Connected to browser extension');
  });

  extensionWs.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString()) as ExtensionMessage;

      if (message.type === 'RESPONSE') {
        const pending = pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingRequests.delete(message.id);

          // Update session last active time
          const session = sessions.get(pending.sessionId);
          if (session) {
            session.lastActiveAt = Date.now();
          }

          if (message.payload.success) {
            pending.resolve(message.payload.data);
          } else {
            pending.reject(new Error(message.payload.error || 'Unknown error'));
          }
        }
      }
    } catch (error) {
      console.error('[Daemon] Failed to parse extension message:', error);
    }
  });

  extensionWs.on('close', () => {
    console.error('[Daemon] Browser extension disconnected');
    extensionWs = null;

    // Clear all pending requests
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Browser extension disconnected'));
    }
    pendingRequests.clear();

    // Attempt to reconnect after 5 seconds
    setTimeout(() => {
      if (sessions.size > 0) {
        connectToExtension();
      }
    }, 5000);
  });

  extensionWs.on('error', (error) => {
    console.error('[Daemon] WebSocket error:', error);
  });
}

/**
 * Send request to browser extension
 */
function sendToExtension(sessionId: string, requestId: string, action: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!extensionWs || extensionWs.readyState !== WebSocket.OPEN) {
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

  // Send SESSION_START to extension
  if (extensionWs && extensionWs.readyState === WebSocket.OPEN) {
    extensionWs.send(JSON.stringify({
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
    if (extensionWs && extensionWs.readyState === WebSocket.OPEN) {
      extensionWs.send(JSON.stringify({
        type: 'SESSION_END',
        sessionId,
      }));
    }

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
        if (extensionWs && extensionWs.readyState === WebSocket.OPEN) {
          extensionWs.send(JSON.stringify({
            type: 'SESSION_END',
            sessionId,
          }));
        }

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

  // Close WebSocket connection
  if (extensionWs) {
    extensionWs.close();
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
function main(): void {
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

  // Start Unix Socket server
  startUnixServer();

  // Connect to browser extension
  connectToExtension();

  // Start idle timer
  resetIdleTimer();

  console.error('[Daemon] Daemon started successfully');
}

// Run
main();
