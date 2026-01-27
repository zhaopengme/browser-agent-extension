# Multi-Client Session v2 Design

Date: 2026-01-26

## Context

We need reliable multi-client support on a single machine: multiple MCP clients should share one browser extension, with session isolation by tab and explicit `tabId` routing. The current daemon-based approach mostly works but has gaps that appear as false “connected” status and occasional request routing ambiguity.

## Goals

- Support multiple MCP clients simultaneously on the same host.
- Isolate each client session by default to its own tab.
- Allow explicit `tabId` targeting for actions.
- Auto-create a new tab when a session sends its first request without `tabId`.
- Provide accurate connection status that reflects the extension WebSocket state.
- Ensure request/response routing is collision-free across sessions.

## Non-Goals

- Multi-host or cross-machine deployments.
- Multiple browser/extension instances.
- Remote discovery or authentication layers.

## Recommended Architecture (Daemon-Centric)

```
MCP Client A/B/C
      │ stdio
      ▼
  MCP Server (per client)
      │ Unix Socket (/tmp/browser-agent-daemon.sock)
      ▼
  Daemon (session router + extension WS)
      │ WebSocket (ws://host:3026)
      ▼
  Extension Side Panel
      │ chrome.runtime.sendMessage
      ▼
  Service Worker (CDP)
```

Key responsibilities:
- **MCP Server:** MCP protocol, session registration, unique request IDs.
- **Daemon:** Session routing, extension WS lifecycle, status queries.
- **Side Panel:** `sessionId ↔ tabId` binding, auto-tab creation, request forwarding.
- **Service Worker:** Executes actions via CDP and content scripts.

## Data Flow

1. MCP Server connects to daemon and registers, receiving `sessionId`.
2. MCP client sends tool call → MCP Server wraps into `{sessionId, requestId, action, params}`.
3. Daemon forwards request to extension WS.
4. Side Panel resolves `tabId`:
   - If `params.tabId` provided: bind/activate that tab for the session.
   - If missing: create new tab (first request) or use existing binding.
5. Side Panel forwards to Service Worker with resolved `tabId`.
6. Response flows back to MCP client with matching `requestId`.

## Protocol & ID Strategy

### Unique Request IDs
To avoid cross-client collisions, request IDs must be globally unique.

Recommendation:
- Use `${sessionId}:${counter}` or UUIDs on MCP Server.
- Daemon must treat `requestId` as opaque and unique across sessions.

### Status Query
In daemon mode, “connected” should mean **extension WS connected**, not merely “daemon session exists”.

Add a daemon `STATUS` request:
```
→ { "type": "STATUS", "id": "status_1" }
← { "type": "STATUS_OK", "id": "status_1", "extensionConnected": true, "activeSessions": 3 }
```

MCP Server’s `browser_get_connection_status` should:
- In daemon mode: call `STATUS`.
- In direct mode: check `extensionClient` state as today.

## Session ↔ Tab Binding

Rules:
- First request without `tabId` → create a new tab and bind it to the session.
- Request with `tabId` → bind session to that tab and target it.
- Subsequent requests without `tabId` → use bound tab.
- On session end: close tab by default (current behavior), or keep open if configured later.

## Error Handling

- **Extension disconnected:** Daemon returns `Browser extension not connected`.
- **Tab missing/closed:** Side Panel returns a clear error; optionally re-create a tab on next request.
- **Timeouts:** Preserve existing 30s request timeouts in both daemon and MCP Server.

## Verification Plan (Manual)

1. Open browser extension side panel.
2. Start two MCP clients; ensure each gets a distinct `sessionId`.
3. Call a simple tool without `tabId` from each client → verify two tabs created.
4. Call tools with explicit `tabId` → verify correct tab receives actions.
5. Disconnect extension WS → verify `browser_get_connection_status` shows disconnected.

## Rollout Notes

- Requires MCP Server changes (unique request IDs, status query).
- Requires daemon changes (STATUS support, extension connection state).
- Side Panel behavior already supports `sessionId` + `tabId`; adjust binding rules if needed.

