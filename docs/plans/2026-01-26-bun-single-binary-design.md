# Bun Single-Binary MCP + Daemon Design

**Goal:** Use Bun to run MCP and daemon from a single entrypoint, and allow compiling to a single binary.

## Architecture
- Create a new entrypoint `mcp-server/src/main.ts` that chooses mode based on `--daemon`.
- Move MCP server logic from `src/index.ts` into `src/mcp.ts` as `runMcpServer()`.
- Move daemon logic from `src/daemon.ts` into `src/daemon.ts` as `runDaemon()` (no auto-run).
- In MCP mode, attempt to connect to daemon; if not running, spawn the same executable with `--daemon` and wait for socket.
- If daemon startup or connection fails, MCP exits (no direct WebSocket fallback).

## Self-Spawn Strategy
- Use `process.execPath` as the executable.
- If `process.argv[1]` ends with `.ts|.js|.mjs|.cjs`, include it when spawning (script mode).
- If not, spawn only `process.execPath` (compiled binary mode).
- Allow override via `BROWSER_AGENT_DAEMON_BIN` for custom daemon command.

## Configuration
- `BROWSER_AGENT_DAEMON_SOCKET`: Unix socket path (default: `XDG_RUNTIME_DIR` or `/tmp`).
- `BROWSER_AGENT_DAEMON_PID`: Optional pid file path (default: `${SOCKET}.pid`).
- `BROWSER_AGENT_DAEMON_LOCK`: Optional lock file path (default: `${SOCKET}.lock`).
- `BROWSER_AGENT_WS_HOST`, `BROWSER_AGENT_WS_PORT`: Extension WebSocket endpoint.

## Error Handling
- If daemon socket directory is not writable, daemon exits with a clear error.
- MCP exits immediately if daemon cannot be started or connected.
- MCP exits on daemon disconnect/error.

## Build & Distribution
- Dev: `bun src/main.ts`
- JS output (optional): `bun build src/main.ts --outdir dist`
- Single binary: `bun build --compile src/main.ts --outfile dist/browser-agent-mcp`

## Testing Strategy
- Add Bun tests for entrypoint mode selection and spawn command resolution.
- Add integration test that starts `--daemon` with a temp socket path and asserts the socket appears.
