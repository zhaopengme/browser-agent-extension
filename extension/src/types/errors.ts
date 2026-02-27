/**
 * Unified error types for Browser Agent Extension
 */

export type ErrorCode =
  | 'NOT_CONNECTED'
  | 'TIMEOUT'
  | 'ELEMENT_NOT_FOUND'
  | 'CDP_ERROR'
  | 'CONTENT_SCRIPT_ERROR'
  | 'INVALID_PARAMS'
  | 'TAB_NOT_FOUND'
  | 'PERMISSION_DENIED';

export class BrowserAgentError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = 'BrowserAgentError';
  }
}
