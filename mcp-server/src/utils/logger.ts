// Simple structured logger

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, module: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;
}

export const logger = {
  debug: (module: string, message: string, ...args: unknown[]) => {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', module, message), ...args);
    }
  },
  info: (module: string, message: string, ...args: unknown[]) => {
    if (shouldLog('info')) {
      console.info(formatMessage('info', module, message), ...args);
    }
  },
  warn: (module: string, message: string, ...args: unknown[]) => {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', module, message), ...args);
    }
  },
  error: (module: string, message: string, ...args: unknown[]) => {
    if (shouldLog('error')) {
      console.error(formatMessage('error', module, message), ...args);
    }
  },
};
