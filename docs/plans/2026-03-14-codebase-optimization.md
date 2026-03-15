# Codebase Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical bugs (dual McpServer, queue deadlock, error swallowing) and clean up dead code across MCP server and extension.

**Architecture:** Four batches — Batch 1 fixes MCP server critical issues, Batch 2 fixes extension error handling, Batch 3 hardens sidepanel WebSocket, Batch 4 removes dead code and unused dependencies.

**Tech Stack:** TypeScript, Bun, Hono, Chrome Extension (Manifest V3)

---

## Batch 1: MCP Server Critical Fixes

### Task 1: Fix dual McpServer instance

`main.ts:22` creates a `McpServer` used only for shutdown. `mcp/handler.ts:6` creates another one that actually handles requests. Shutdown closes the wrong instance.

**Files:**
- Modify: `mcp-server/src/main.ts:19-22,66-74`
- Modify: `mcp-server/src/mcp/handler.ts:4-6`

**Step 1: Export mcpServer from handler.ts instead of creating locally**

In `mcp-server/src/mcp/handler.ts`, export the existing `mcpServer`:

```typescript
// Before (line 6):
const mcpServer = createMcpServer();

// After:
export const mcpServer = createMcpServer();
```

**Step 2: Import from handler.ts in main.ts, remove duplicate creation**

In `mcp-server/src/main.ts`:

```typescript
// Before (lines 19, 22):
import { createMcpServer } from './mcp/server.js';
const mcpServer = createMcpServer();

// After:
import { mcpServer } from './mcp/handler.js';
// (remove line 22 entirely)
```

**Step 3: Run tests to verify**

Run: `cd mcp-server && bun test`
Expected: All existing tests pass.

**Step 4: Commit**

```bash
git add mcp-server/src/main.ts mcp-server/src/mcp/handler.ts
git commit -m "fix: use single McpServer instance for both handling and shutdown"
```

---

### Task 2: Fix processQueue deadlock

`bridge/store.ts:181-197` — if `processQueue` loop throws an uncaught exception, `processingQueue` stays `true` forever and the queue stops processing.

**Files:**
- Modify: `mcp-server/src/bridge/store.ts:181-198`

**Step 1: Add try/finally to ensure processingQueue is always reset**

```typescript
// Replace processQueue method (lines 181-198):
private async processQueue(): Promise<void> {
  if (this.processingQueue || this.requestQueue.length === 0) return;
  if (this.state.status !== 'ready') return;

  this.processingQueue = true;

  try {
    while (this.requestQueue.length > 0 && this.state.status === 'ready') {
      const next = this.requestQueue.shift()!;
      try {
        const result = await this.executeRequest(next.payload, next.timeoutMs);
        next.resolve(result);
      } catch (error) {
        next.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  } finally {
    this.processingQueue = false;
  }
}
```

**Step 2: Run tests**

Run: `cd mcp-server && bun test`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add mcp-server/src/bridge/store.ts
git commit -m "fix: ensure processingQueue flag is always reset via try/finally"
```

---

### Task 3: Fix ws/handler onError missing cleanup

`ws/handler.ts:139-141` — `onError` doesn't clear the HELLO timer or trigger bridge cleanup. If `onClose` doesn't fire after error, the bridge holds a zombie reference.

**Files:**
- Modify: `mcp-server/src/ws/handler.ts:139-141`

**Step 1: Add cleanup logic to onError**

```typescript
// Replace onError (lines 139-141):
onError: (event: Event, ws: WSContext) => {
  logger.error('WS', 'WebSocket error', event);

  // Clear HELLO timer if still pending
  if (helloTimer) {
    clearTimeout(helloTimer);
    helloTimer = null;
  }

  // Clean up bridge in case onClose doesn't fire
  bridgeStore.removeExtension(ws);
},
```

**Step 2: Remove unused `thisWs` variable**

Remove `let thisWs: WSContext | null = null;` (line 17), `thisWs = ws;` (line 21), and `thisWs = null;` (line 136).

```typescript
// Line 17: DELETE this line
let thisWs: WSContext | null = null;

// Line 21 (inside onOpen): DELETE this line
thisWs = ws;

// Line 136 (inside onClose): DELETE this line
thisWs = null;
```

**Step 3: Run tests**

Run: `cd mcp-server && bun test`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add mcp-server/src/ws/handler.ts
git commit -m "fix: cleanup HELLO timer and bridge on WebSocket error, remove unused thisWs"
```

---

## Batch 2: Extension Error Handling Fixes

### Task 4: Fix navigation error swallowing

`extension/src/background/actions/navigation.ts` — all four handlers (`navigate`, `go_back`, `go_forward`, `reload`) silently catch real errors and return success. The fix: let errors propagate but still attempt waitForLoadState as best-effort.

**Files:**
- Modify: `extension/src/background/actions/navigation.ts`

**Step 1: Rewrite navigation handlers to propagate real errors**

```typescript
/**
 * Navigation actions: navigate, go_back, go_forward, reload
 */

import type { ActionHandler } from '../router';
import { requireParam } from '../utils/validate';

async function waitForLoad(page: Parameters<ActionHandler>[0]['page']): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  await page.ensureConnected();
}

const navigate: ActionHandler = async ({ page, params }) => {
  const url = requireParam<string>(params, 'url', 'string');
  await page.navigateTo(url);
  await waitForLoad(page);
  const info = await page.getPageInfo();
  return { url: info.url, title: info.title };
};

const go_back: ActionHandler = async ({ page }) => {
  await page.goBack();
  await waitForLoad(page);
  return { navigated: true };
};

const go_forward: ActionHandler = async ({ page }) => {
  await page.goForward();
  await waitForLoad(page);
  return { navigated: true };
};

const reload: ActionHandler = async ({ page }) => {
  await page.reload();
  await waitForLoad(page);
  return { reloaded: true };
};

export const navigationHandlers: Record<string, ActionHandler> = {
  navigate,
  go_back,
  go_forward,
  reload,
};
```

Key change: `navigateTo`/`goBack`/`goForward`/`reload` errors now propagate. Only `waitForLoadState` is best-effort (`.catch(() => {})`), which is acceptable since the navigation itself already succeeded.

**Step 2: Commit**

```bash
git add extension/src/background/actions/navigation.ts
git commit -m "fix: propagate navigation errors instead of silently swallowing them"
```

---

### Task 5: Fix overlay silent success on failure

`extension/src/background/actions/overlay.ts` — `sendOverlayMessage` catches all errors silently, so `lock`/`unlock`/`update_status` always return success even when the content script didn't receive the message.

**Files:**
- Modify: `extension/src/background/actions/overlay.ts:9-18`

**Step 1: Let sendOverlayMessage propagate errors with a warning**

```typescript
// Replace sendOverlayMessage (lines 9-18):
async function sendOverlayMessage(type: string, payload: unknown, tabId?: number): Promise<void> {
  const targetTabId = await getTargetTabId(tabId);
  if (!targetTabId) {
    console.debug(`[Background] ${type}: no target tab`);
    return;
  }
  await chrome.tabs.sendMessage(targetTabId, { type, payload });
}
```

Remove the try/catch so that `chrome.tabs.sendMessage` errors bubble up to the action router, which already has error handling. If the content script is not injected, the caller will get an error instead of a fake `{ locked: true }`.

**Step 2: Commit**

```bash
git add extension/src/background/actions/overlay.ts
git commit -m "fix: propagate overlay message errors instead of returning fake success"
```

---

## Batch 3: Sidepanel Robustness

### Task 6: Fix sidepanel log memory leak

`extension/src/sidepanel/sidepanel.ts:106-131` — `addLog` appends DOM nodes without limit. Long-running sessions accumulate thousands of nodes.

**Files:**
- Modify: `extension/src/sidepanel/sidepanel.ts:106-131`

**Step 1: Add max log entries limit to addLog**

Add a constant and trim logic at the top of `addLog`:

```typescript
// Add after line 9 (constants section):
const MAX_LOG_ENTRIES = 200;

// In addLog function, add after line 125 (logContainer.appendChild):
// Trim old entries if exceeding limit
while (logContainer.children.length > MAX_LOG_ENTRIES) {
  logContainer.removeChild(logContainer.firstChild!);
}
```

**Step 2: Commit**

```bash
git add extension/src/sidepanel/sidepanel.ts
git commit -m "fix: limit sidepanel log entries to 200 to prevent DOM memory leak"
```

---

### Task 7: Guard ws.send() against closed connections

`extension/src/sidepanel/sidepanel.ts:262,283` — `ws?.send()` can silently fail if the WebSocket closed during request processing. MCP Server request hangs until timeout.

**Files:**
- Modify: `extension/src/sidepanel/sidepanel.ts:215-294`

**Step 1: Add a safeSend helper and use it**

```typescript
// Add before the connect() function:
function safeSend(message: object): boolean {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  console.warn('[SidePanel] Cannot send: WebSocket not open');
  return false;
}
```

**Step 2: Replace all `ws?.send(JSON.stringify(...))` calls in onmessage**

In the `ws.onmessage` handler, replace:

```typescript
// Line 262: error response path
ws?.send(JSON.stringify(errorResponse));
// Replace with:
safeSend(errorResponse);

// Line 283: success response path
ws?.send(JSON.stringify(wsResponse));
// Replace with:
safeSend(wsResponse);
```

Also replace the HELLO send on line 211:

```typescript
// Line 211:
ws?.send(JSON.stringify(helloMessage));
// Replace with:
safeSend(helloMessage);
```

**Step 3: Commit**

```bash
git add extension/src/sidepanel/sidepanel.ts
git commit -m "fix: guard WebSocket sends against closed connections"
```

---

## Batch 4: Dead Code & Dependency Cleanup

### Task 8: Remove unused AI SDK dependencies from extension

`extension/package.json` contains 4 AI SDK packages (`@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`, `ai`) that have zero imports in the codebase. They bloat the extension bundle.

**Files:**
- Modify: `extension/package.json`

**Step 1: Remove the 4 unused dependencies**

```bash
cd extension && npm uninstall @ai-sdk/anthropic @ai-sdk/google @ai-sdk/openai ai
```

**Step 2: Verify extension still builds**

```bash
cd extension && npm run build
```

**Step 3: Commit**

```bash
git add extension/package.json extension/package-lock.json
git commit -m "chore: remove unused AI SDK dependencies from extension"
```

---

### Task 9: Remove MCP server dead code files

These files are never imported and diverge from actual tool definitions in `server.ts`:

- `mcp-server/src/middleware/logger.ts` — dead, replaced by inline middleware in `main.ts`
- `mcp-server/src/mcp/tools/advanced.ts` — legacy, not imported
- `mcp-server/src/mcp/tools/info.ts` — legacy, not imported
- `mcp-server/src/mcp/tools/interaction.ts` — legacy, not imported
- `mcp-server/src/mcp/tools/navigation.ts` — legacy, not imported
- `mcp-server/src/mcp/tools/network.ts` — legacy, not imported
- `mcp-server/src/mcp/tools/tabs.ts` — legacy, not imported
- `mcp-server/src/mcp/tools/waiting.ts` — legacy, not imported

Keep `mcp-server/src/mcp/tools/index.ts` — it exports `getActionFromToolName` which IS used by `server.ts`.

**Files:**
- Delete: 8 files listed above

**Step 1: Verify these files are not imported anywhere**

Search for imports of these files to confirm they are dead code. Grep for `middleware/logger`, `tools/advanced`, `tools/info`, `tools/interaction`, `tools/navigation`, `tools/network`, `tools/tabs`, `tools/waiting` in `mcp-server/src/`.

**Step 2: Delete the files**

```bash
rm mcp-server/src/middleware/logger.ts
rm mcp-server/src/mcp/tools/advanced.ts
rm mcp-server/src/mcp/tools/info.ts
rm mcp-server/src/mcp/tools/interaction.ts
rm mcp-server/src/mcp/tools/navigation.ts
rm mcp-server/src/mcp/tools/network.ts
rm mcp-server/src/mcp/tools/tabs.ts
rm mcp-server/src/mcp/tools/waiting.ts
```

If `mcp-server/src/middleware/` directory is now empty, remove it too:
```bash
rmdir mcp-server/src/middleware
```

**Step 3: Remove unused `tsx` devDependency from mcp-server**

```bash
cd mcp-server && npm uninstall tsx
```

**Step 4: Also remove unused `checkAndCleanupDeadConnection` method from store.ts**

This method (`bridge/store.ts:58-75`) is defined but never called anywhere. Remove it.

```typescript
// DELETE lines 58-75:
/**
 * Try to ping the existing connection, clean it up if it fails
 */
async checkAndCleanupDeadConnection(): Promise<boolean> {
  // ... entire method
}
```

**Step 5: Run tests**

```bash
cd mcp-server && bun test
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove legacy tool files, dead middleware, unused deps and methods"
```

---

### Task 10: Remove duplicate getElementByIndex in extension

`extension/src/content/interaction.ts:9-14` and `extension/src/content/resource.ts:8-14` have identical `getElementByIndex` implementations.

**Files:**
- Modify: `extension/src/content/state.ts` — add the shared function here
- Modify: `extension/src/content/interaction.ts` — import from state.ts
- Modify: `extension/src/content/resource.ts` — import from state.ts

**Step 1: Read current getElementByIndex implementation**

The function (identical in both files):
```typescript
function getElementByIndex(index: number): Element | null {
  const el = elementIndexMap.get(index);
  if (el) return el;
  return document.querySelector(`[data-agent-index="${index}"]`);
}
```

**Step 2: Export getElementByIndex from state.ts**

Add at the end of `extension/src/content/state.ts`:

```typescript
export function getElementByIndex(index: number): Element | null {
  const el = elementIndexMap.get(index);
  if (el) return el;
  return document.querySelector(`[data-agent-index="${index}"]`);
}
```

**Step 3: Update interaction.ts to import from state.ts**

Remove the local `getElementByIndex` function and add import:

```typescript
import { getElementByIndex } from './state';
```

**Step 4: Update resource.ts to import from state.ts**

Remove the local `getElementByIndex` function and add import:

```typescript
import { getElementByIndex } from './state';
```

**Step 5: Verify extension builds**

```bash
cd extension && npm run build
```

**Step 6: Commit**

```bash
git add extension/src/content/state.ts extension/src/content/interaction.ts extension/src/content/resource.ts
git commit -m "refactor: deduplicate getElementByIndex into shared state module"
```
