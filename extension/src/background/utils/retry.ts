/**
 * Retry utility for retryable operations
 */

import { BrowserAgentError } from '@/types/errors';

interface RetryOptions {
  retries?: number;
  delay?: number;
  retryableCheck?: (e: Error) => boolean;
}

/**
 * Execute a function with automatic retry on retryable errors.
 * By default retries once with 500ms delay.
 * Only retries if the error is a BrowserAgentError with retryable=true,
 * or if a custom retryableCheck returns true.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const retries = options?.retries ?? 1;
  const delay = options?.delay ?? 500;
  const retryableCheck = options?.retryableCheck ?? ((e: Error) => {
    return e instanceof BrowserAgentError && e.retryable;
  });

  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries && retryableCheck(lastError)) {
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError!;
}
