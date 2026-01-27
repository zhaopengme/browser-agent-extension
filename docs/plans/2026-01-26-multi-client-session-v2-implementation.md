# Multi-Client Session v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make multi-client support reliable by fixing daemon status reporting, eliminating request ID collisions, and honoring explicit `tabId` routing with session-based tab binding.

**Architecture:** Keep the daemon as the session router. MCP Server generates globally unique request IDs and queries daemon status. Side Panel binds each session to a tab and respects explicit `tabId` overrides, auto-creating tabs when missing.

**Tech Stack:** TypeScript, Node.js, MCP SDK, WebSocket, Chrome Extension (MV3)

**Testing:** Skipped per user approval (no existing test framework). Manual verification steps included.

**Commits:** Skipped per instruction (no git commits unless requested).

### Task 1: Add daemon status query and extension state

**Files:**
- Modify: `mcp-server/src/daemon.ts:43-220`

**Step 1: Extend daemon message types**

Add `STATUS` to `DaemonMessage` and define a `STATUS_OK` response shape.

**Step 2: Implement status handler**

Add a helper to compute `extensionConnected` (true if any extension WebSocket is open) and respond with `{ extensionConnected, activeSessions }`.

**Step 3: Wire STATUS handling into the Unix socket message switch**

Handle `STATUS` requests by replying with `STATUS_OK`.

**Step 4: Commit (skipped per instruction)**

---

### Task 2: Make MCP Server IDs globally unique and query daemon status

**Files:**
- Modify: `mcp-server/src/index.ts:35-380`
- Modify: `mcp-server/src/index.ts:1326-1357`

**Step 1: Add a request ID generator**

Generate IDs that include the `sessionId` (e.g., `${sessionId}:${counter}`) to avoid collisions across clients.

**Step 2: Update sendViaDaemon to use unique IDs**

Ensure all daemon requests use the new generator.

**Step 3: Add daemon status request**

Implement a `getDaemonStatus()` that sends `STATUS` and resolves on `STATUS_OK`.

**Step 4: Update daemon message handler**

Handle `STATUS_OK` by resolving the pending status promise.

**Step 5: Fix browser_get_connection_status**

In daemon mode, call `getDaemonStatus()` and set `connected` based on `extensionConnected`.

**Step 6: Commit (skipped per instruction)**

---

### Task 3: Honor explicit tabId in Side Panel routing

**Files:**
- Modify: `extension/src/sidepanel/sidepanel.ts:257-525`

**Step 1: Add tab binding helper**

Implement a small helper to bind a `sessionId` to a provided `tabId`, validating the tab exists.

**Step 2: Use explicit tabId when provided**

In WebSocket REQUEST handling, if `params.tabId` is present, bind the session to that tab and use it. Otherwise fall back to `getOrCreateTabForSession`.

**Step 3: Preserve existing auto-tab behavior**

Ensure first request without `tabId` still creates a new tab and binds it to the session.

**Step 4: Commit (skipped per instruction)**

---

### Task 4: Manual verification

**Files:** none

**Step 1: Start daemon + MCP Server**

Confirm daemon logs show WebSocket listening and `STATUS` responses work.

**Step 2: Connect extension side panel**

Verify daemon logs show “Extension connected”.

**Step 3: Two MCP clients**

Open two MCP clients and confirm each gets a distinct `sessionId`.

**Step 4: Tab binding**

Call `browser_switch_tab` with an explicit `tabId` and confirm subsequent actions target that tab.

