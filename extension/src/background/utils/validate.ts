/**
 * Parameter validation utilities for action handlers
 */

import { BrowserAgentError } from '@/types/errors';

/**
 * Require a parameter to be present and optionally of a specific type.
 * Throws BrowserAgentError with INVALID_PARAMS code if validation fails.
 */
export function requireParam<T>(
  params: Record<string, unknown>,
  key: string,
  type?: string
): T {
  const value = params[key];
  if (value === undefined || value === null) {
    throw new BrowserAgentError(`${key} is required`, 'INVALID_PARAMS');
  }
  if (type && typeof value !== type) {
    throw new BrowserAgentError(`${key} must be ${type}`, 'INVALID_PARAMS');
  }
  return value as T;
}

/**
 * Require at least one of the provided keys to be present.
 */
export function requireOneOf(
  params: Record<string, unknown>,
  keys: string[]
): void {
  const hasOne = keys.some(key => params[key] !== undefined && params[key] !== null);
  if (!hasOne) {
    throw new BrowserAgentError(
      `One of [${keys.join(', ')}] is required`,
      'INVALID_PARAMS'
    );
  }
}
