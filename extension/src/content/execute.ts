/**
 * Script execution in page context
 */

import type { ContentResponse } from '@/types/message';

export function executeScript(script: string): ContentResponse<unknown> {
  try {
    // eslint-disable-next-line no-eval
    const result = eval(script);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
