import { parseMode } from './entrypoint.js';
import { runDaemon } from './daemon.js';
import { runMcpServer } from './mcp.js';
import { writeStartupLog } from './logging.js';
import * as path from 'node:path';

export function runMain(options: { argv?: string[]; dryRun?: boolean } = {}): 'daemon' | 'mcp' {
  const mode = parseMode(options.argv ?? process.argv.slice(2));
  const daemonSocket = process.env.BROWSER_AGENT_DAEMON_SOCKET;
  const logFile = process.env.BROWSER_AGENT_LOG_FILE
    ?? (daemonSocket ? `${daemonSocket}.log` : path.join(process.cwd(), '.run', 'browser-agent.log'));

  writeStartupLog(logFile, {
    mode,
    execPath: process.execPath,
    argv: process.argv.join(' '),
    cwd: process.cwd(),
    daemonSocket: daemonSocket ?? '',
    wsPort: process.env.BROWSER_AGENT_WS_PORT ?? '3026',
  });

  if (options.dryRun) {
    return mode;
  }

  if (mode === 'daemon') {
    runDaemon();
  } else {
    runMcpServer().catch((error) => {
      console.error('[MCP Server] Fatal error:', error);
      process.exit(1);
    });
  }

  return mode;
}

if (import.meta.main) {
  runMain();
}
