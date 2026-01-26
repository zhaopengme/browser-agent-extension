# Multi-Client Session Support Design

Date: 2026-01-26

## Overview

Enable multiple MCP clients (Claude Desktop, Cursor, etc.) to simultaneously control different browser tabs through a single daemon process with session-based isolation.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Extension                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   Side Panel                         │    │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐          │    │
│  │  │ Session A │ │ Session B │ │ Session C │  ...     │    │
│  │  │  Tab #12  │ │  Tab #15  │ │  Tab #18  │          │    │
│  │  └───────────┘ └───────────┘ └───────────┘          │    │
│  └─────────────────────────────────────────────────────┘    │
│                          ▲                                   │
│                          │ WebSocket (:3026)                 │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                     Daemon Process                           │
│                          │                                   │
│    ┌─────────────────────┴─────────────────────┐            │
│    │           Session Manager                  │            │
│    │  ┌─────────┐ ┌─────────┐ ┌─────────┐      │            │
│    │  │ sess_A  │ │ sess_B  │ │ sess_C  │      │            │
│    │  │ tab: 12 │ │ tab: 15 │ │ tab: 18 │      │            │
│    │  └────┬────┘ └────┬────┘ └────┬────┘      │            │
│    └───────┼───────────┼───────────┼───────────┘            │
│            │           │           │                         │
│            ▼           ▼           ▼                         │
│    ┌──────────────────────────────────────────┐             │
│    │         Unix Socket Server               │             │
│    │    /tmp/browser-agent-daemon.sock        │             │
│    └──────────────────────────────────────────┘             │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐
   │MCP Server │    │MCP Server │    │MCP Server │
   │ (sess_A)  │    │ (sess_B)  │    │ (sess_C)  │
   └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
         │                │                │
    Claude Desktop     Cursor           Other
```

## Core Components

### 1. Daemon Process

**Responsibilities:**
- Manage WebSocket connection to browser extension (port 3026)
- Manage Unix Socket server for MCP clients (`/tmp/browser-agent-daemon.sock`)
- Route requests between MCP clients and browser extension
- Track session-to-tab bindings
- Auto-start when first MCP client connects
- Auto-exit after 60s of no active sessions

**Lifecycle:**
```
First MCP Server starts
      │
      ▼
Check Unix Socket exists and connectable?
      │
      ├─ Yes ──► Connect to existing Daemon
      │
      └─ No ──► Fork new Daemon process (detached)
                      │
                      ▼
               Wait for Daemon ready
                      │
                      ▼
               Connect and register
```

### 2. MCP Server (Modified)

**Changes:**
- Check for daemon on startup
- If no daemon, spawn it as detached child process
- Connect to daemon via Unix Socket
- Send REGISTER message to get session ID
- Prefix all requests with session ID
- Handle session-specific responses

### 3. Browser Extension (Modified)

**Changes:**
- Accept `sessionId` field in all WebSocket messages
- Maintain session-to-tab mapping
- Create new tab for first request from a session
- Route subsequent requests to session's bound tab
- Display session list in Side Panel
- Clean up tab when session disconnects

## Communication Protocols

### MCP Server ↔ Daemon (Unix Socket)

**Message Format:** JSON + newline delimiter

```typescript
// Register session
→ { "type": "REGISTER", "id": "msg_1" }
← { "type": "REGISTER_OK", "id": "msg_1", "sessionId": "sess_a1b2c3d4" }

// Execute action (with session ID)
→ { "type": "REQUEST", "id": "req_1", "sessionId": "sess_a1b2c3d4", "action": "navigate", "params": { "url": "..." } }
← { "type": "RESPONSE", "id": "req_1", "sessionId": "sess_a1b2c3d4", "payload": { "success": true, "data": {...} } }

// Heartbeat
→ { "type": "PING", "id": "ping_1", "sessionId": "sess_a1b2c3d4" }
← { "type": "PONG", "id": "ping_1" }

// Disconnect
→ { "type": "DISCONNECT", "sessionId": "sess_a1b2c3d4" }
```

### Daemon ↔ Browser Extension (WebSocket)

**Message Format:** Extend existing protocol with `sessionId` field

```typescript
// Request (add sessionId)
→ { "type": "REQUEST", "id": "req_1", "sessionId": "sess_a1b2c3d4", "action": "navigate", "params": {...} }

// Response (echo sessionId for routing)
← { "type": "RESPONSE", "id": "req_1", "sessionId": "sess_a1b2c3d4", "payload": {...} }

// Session lifecycle notifications
→ { "type": "SESSION_START", "sessionId": "sess_a1b2c3d4" }
→ { "type": "SESSION_END", "sessionId": "sess_a1b2c3d4" }
```

## Session Management

### Session ID Generation

- Format: `sess_` + 8-character random hex (e.g., `sess_a1b2c3d4`)
- Generated by daemon on REGISTER
- Unique per MCP client connection

### Session-to-Tab Binding

**Strategy:** Each session gets its own tab

| Event | Behavior |
|-------|----------|
| First request from session | Create new tab, bind to session |
| Subsequent requests | Route to session's bound tab |
| Session disconnect | Optional: close tab or keep open |
| Tab closed by user | Notify daemon, clear binding |

**Tab Binding Storage:**
```typescript
interface SessionBinding {
  sessionId: string;
  tabId: number;
  createdAt: number;
  lastActiveAt: number;
}

const sessionBindings = new Map<string, SessionBinding>();
```

### Session Lifecycle

```
MCP Client starts
      │
      ▼
Connect to Daemon
      │
      ▼
REGISTER → get sessionId
      │
      ▼
First browser action
      │
      ▼
Extension creates new tab
      │
      ▼
Bind session to tab
      │
      ▼
All actions route to this tab
      │
      ▼
MCP Client exits
      │
      ▼
DISCONNECT
      │
      ▼
Extension cleans up (optional: close tab)
```

## File Paths

| Platform | Unix Socket | PID File | Log File |
|----------|-------------|----------|----------|
| Linux/macOS | `/tmp/browser-agent-daemon.sock` | `/tmp/browser-agent-daemon.pid` | `~/.browser-agent/daemon.log` |
| Windows | `\\.\pipe\browser-agent-daemon` | `%TEMP%\browser-agent-daemon.pid` | `%APPDATA%\browser-agent\daemon.log` |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Daemon crashes | MCP Server detects socket closed, attempts restart |
| Extension disconnects | Daemon clears all pending requests, notifies MCP Servers |
| Session timeout | Daemon removes session after 5 minutes of inactivity |
| Port 3026 occupied | Daemon fails to start, MCP Server reports error |
| Unix Socket permission denied | MCP Server reports error with instructions |

## Side Panel UI Changes

### Session List Display

```
┌─────────────────────────────────────┐
│  Browser Agent - Sessions           │
├─────────────────────────────────────┤
│  ● sess_a1b2 (Claude Desktop)       │
│    Tab: example.com                 │
│    Active: 2s ago                   │
├─────────────────────────────────────┤
│  ● sess_c3d4 (Cursor)               │
│    Tab: github.com                  │
│    Active: 5s ago                   │
├─────────────────────────────────────┤
│  ○ sess_e5f6 (Disconnected)         │
│    Tab: (closed)                    │
│    Last seen: 2m ago                │
└─────────────────────────────────────┘
```

**Features:**
- Real-time session status (connected/disconnected)
- Show bound tab title/URL
- Last activity timestamp
- Click to focus session's tab
- Button to close session's tab

## Implementation Phases

### Phase 1: Daemon Core
- [ ] Create daemon process with Unix Socket server
- [ ] Implement session registration and management
- [ ] Add WebSocket client to connect to extension
- [ ] Implement request routing with session ID

### Phase 2: MCP Server Integration
- [ ] Modify MCP server to detect and spawn daemon
- [ ] Add Unix Socket client
- [ ] Implement REGISTER/REQUEST/DISCONNECT protocol
- [ ] Add session ID to all requests

### Phase 3: Extension Changes
- [ ] Accept sessionId in WebSocket messages
- [ ] Implement session-to-tab binding
- [ ] Create new tab on first session request
- [ ] Route requests to correct tab based on session

### Phase 4: Side Panel UI
- [ ] Display session list
- [ ] Show session status and bound tab
- [ ] Add tab focus and close controls
- [ ] Real-time updates

### Phase 5: Testing & Polish
- [ ] Test with multiple MCP clients
- [ ] Test daemon auto-start and recovery
- [ ] Test session cleanup on disconnect
- [ ] Add logging and debugging tools

## Backward Compatibility

**Strategy:** Graceful degradation

- If `sessionId` is missing in request, use legacy single-client mode
- Extension maintains backward compatibility with old MCP servers
- New MCP servers work with old extensions (single session only)

## Security Considerations

- Unix Socket permissions: 0600 (owner only)
- Daemon PID file prevents multiple instances
- Session IDs are cryptographically random
- No cross-session data leakage

## Performance Impact

- Daemon adds ~10MB memory overhead
- Unix Socket IPC: <1ms latency
- Session routing: negligible overhead
- Tab creation: one-time cost per session

## Future Enhancements

- Named sessions (user-configurable)
- Session persistence across daemon restarts
- Session sharing (multiple clients control same tab)
- Session migration (move session to different tab)
- Session recording/replay
