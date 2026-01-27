import * as fs from 'node:fs';
import * as path from 'node:path';

type LogFields = Record<string, string | number | boolean | null | undefined>;

function formatFields(fields: LogFields): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}=${value ?? ''}`)
    .join(' ');
}

export function writeStartupLog(logFile: string, fields: LogFields): void {
  const dir = path.dirname(logFile);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (error) {
    console.error(`[MCP Server] Failed to create log dir: ${dir}`, error);
    return;
  }

  const line = `${new Date().toISOString()} ${formatFields(fields)}\n`;

  try {
    fs.appendFileSync(logFile, line, 'utf8');
  } catch (error) {
    console.error(`[MCP Server] Failed to write log file: ${logFile}`, error);
  }
}
