/**
 * Console log actions: get_console_logs, enable_console_capture
 */

import type { ActionHandler } from '../router';

const get_console_logs: ActionHandler = async ({ page, params }) => {
  const logs = await page.getConsoleLogs();

  const types = params.types as string[] | undefined;
  const filteredLogs = types && types.length > 0
    ? logs.filter(log => types.includes(log.type))
    : logs;

  return { logs: filteredLogs, count: filteredLogs.length };
};

const enable_console_capture: ActionHandler = async ({ page }) => {
  await page.enableConsoleCapture();
  return { enabled: true };
};

export const consoleHandlers: Record<string, ActionHandler> = {
  get_console_logs,
  enable_console_capture,
};
