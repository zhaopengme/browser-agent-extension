# Bun Single-Binary MCP + Daemon Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Node-based MCP/daemon split with a Bun entrypoint that can run both modes and compile to a single binary.

**Architecture:** Introduce `src/main.ts` as the single entrypoint; move MCP server logic to `src/mcp.ts` and daemon logic to `src/daemon.ts` export functions. MCP spawns the same executable with `--daemon` when needed and exits if daemon is unavailable.

**Tech Stack:** Bun runtime, Bun build (`bun build --compile`), existing MCP SDK and ws library, Unix sockets.

> **Note:** User requested no worktrees; execute in current workspace.

---

### Task 1: Add entrypoint unit tests (TDD)

**Files:**
- Create: `mcp-server/tests/entrypoint.test.ts`
- Modify: `mcp-server/package.json`

**Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test";
import { resolveSelfCommand } from "../src/entrypoint";

test("resolveSelfCommand uses script path when argv[1] is a JS file", () => {
  const result = resolveSelfCommand("/usr/bin/bun", "/abs/main.ts");
  expect(result.cmd).toBe("/usr/bin/bun");
  expect(result.args).toEqual(["/abs/main.ts"]);
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && bun test tests/entrypoint.test.ts`  
Expected: FAIL because `resolveSelfCommand` does not exist.

**Step 3: Write minimal implementation**

Create `mcp-server/src/entrypoint.ts` exporting `resolveSelfCommand(execPath, argv1)` and `isDaemonMode(argv)`.

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && bun test tests/entrypoint.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add mcp-server/tests/entrypoint.test.ts mcp-server/src/entrypoint.ts mcp-server/package.json
git commit -m "test: add entrypoint helpers for bun binary mode"
```

---

### Task 2: Refactor daemon to export `runDaemon` (TDD)

**Files:**
- Modify: `mcp-server/src/daemon.ts`
- Test: `mcp-server/tests/daemon-mode.test.ts`

**Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test";
import { runDaemon } from "../src/daemon";

test("runDaemon starts without throwing", () => {
  expect(() => runDaemon({ dryRun: true })).not.toThrow();
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && bun test tests/daemon-mode.test.ts`  
Expected: FAIL because `runDaemon` export does not exist.

**Step 3: Write minimal implementation**

Export `runDaemon()` from `src/daemon.ts`, guard auto-run with `if (import.meta.main && !process.argv.includes("--daemon"))` or remove auto-run entirely. Add optional `dryRun` flag for tests.

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && bun test tests/daemon-mode.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add mcp-server/src/daemon.ts mcp-server/tests/daemon-mode.test.ts
git commit -m "refactor: export runDaemon"
```

---

### Task 3: Refactor MCP server to export `runMcpServer` (TDD)

**Files:**
- Modify: `mcp-server/src/index.ts` → `mcp-server/src/mcp.ts`
- Create: `mcp-server/src/mcp.ts`
- Test: `mcp-server/tests/mcp-mode.test.ts`

**Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test";
import { buildSpawnArgs } from "../src/mcp";

test("buildSpawnArgs returns --daemon for self spawn", () => {
  const result = buildSpawnArgs({ cmd: "/usr/bin/bun", args: ["/abs/main.ts"] });
  expect(result.args).toContain("--daemon");
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && bun test tests/mcp-mode.test.ts`  
Expected: FAIL because `buildSpawnArgs` does not exist.

**Step 3: Write minimal implementation**

Move existing MCP logic into `src/mcp.ts`, export `runMcpServer()` plus helper `buildSpawnArgs()` for tests. Ensure daemon failure exits with code 1 and no fallback.

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && bun test tests/mcp-mode.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add mcp-server/src/mcp.ts mcp-server/tests/mcp-mode.test.ts
git commit -m "refactor: export runMcpServer and helpers"
```

---

### Task 4: Add unified entrypoint `main.ts`

**Files:**
- Create: `mcp-server/src/main.ts`
- Modify: `mcp-server/package.json`

**Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test";
import { parseMode } from "../src/entrypoint";

test("parseMode returns daemon for --daemon", () => {
  expect(parseMode(["--daemon"])).toBe("daemon");
});
```

**Step 2: Run test to verify it fails**

Run: `cd mcp-server && bun test tests/entrypoint.test.ts`  
Expected: FAIL because `parseMode` does not exist.

**Step 3: Write minimal implementation**

Create `main.ts` that uses `parseMode`, then calls `runDaemon()` or `runMcpServer()`.

**Step 4: Run test to verify it passes**

Run: `cd mcp-server && bun test tests/entrypoint.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add mcp-server/src/main.ts mcp-server/src/entrypoint.ts mcp-server/tests/entrypoint.test.ts mcp-server/package.json
git commit -m "feat: add unified main entrypoint"
```

---

### Task 5: Update build scripts and docs

**Files:**
- Modify: `mcp-server/package.json`
- Modify: `README.md:40`
- Modify: `README_CN.md:40`

**Step 1: Update scripts**

Add:
```json
"scripts": {
  "dev": "bun src/main.ts",
  "build": "bun build src/main.ts --outdir dist",
  "build:bin": "bun build --compile src/main.ts --outfile dist/browser-agent-mcp",
  "test": "bun test"
}
```

**Step 2: Update docs**

Document `.mcp.json` using the binary:
```json
{
  "mcpServers": {
    "browser-agent": {
      "type": "stdio",
      "command": "/abs/path/to/dist/browser-agent-mcp"
    }
  }
}
```

**Step 3: Verify docs references**

Run: `rg -n "browser-agent-extension-mcp|dist/main.js|bun" README.md README_CN.md`

**Step 4: Commit**

```bash
git add mcp-server/package.json README.md README_CN.md
git commit -m "docs: add bun build and binary usage"
```

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-01-26-bun-single-binary-implementation.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration  
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints  

Which approach?
