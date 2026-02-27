/**
 * Wait actions: wait_for_selector, wait_for_timeout, wait_for_load_state, wait_for_function
 */

import type { ActionHandler } from '../router';
import { requireParam } from '../utils/validate';
import { BrowserAgentError } from '@/types/errors';

const wait_for_selector: ActionHandler = async ({ page, params }) => {
  const selector = requireParam<string>(params, 'selector', 'string');

  const found = await page.waitForSelector(selector, {
    visible: params.visible as boolean | undefined,
    hidden: params.hidden as boolean | undefined,
    timeout: params.timeout as number | undefined,
  });

  return { found, selector };
};

const wait_for_timeout: ActionHandler = async ({ page, params }) => {
  const ms = requireParam<number>(params, 'ms', 'number');
  await page.waitForTimeout(ms);
  return { waited: true, ms };
};

const wait_for_load_state: ActionHandler = async ({ page, params }) => {
  const state = (params.state as string) || 'load';
  const validStates = ['load', 'domcontentloaded', 'networkidle'];
  if (!validStates.includes(state)) {
    throw new BrowserAgentError(
      `Invalid state: ${state}. Must be one of: ${validStates.join(', ')}`,
      'INVALID_PARAMS'
    );
  }

  const success = await page.waitForLoadState(
    state as 'load' | 'domcontentloaded' | 'networkidle',
    { timeout: params.timeout as number | undefined }
  );

  return { success, state };
};

const wait_for_function: ActionHandler = async ({ page, params }) => {
  const fn = requireParam<string>(params, 'function', 'string');

  const success = await page.waitForFunction(fn, {
    timeout: params.timeout as number | undefined,
    polling: params.polling as number | undefined,
  });

  return { success };
};

export const waitHandlers: Record<string, ActionHandler> = {
  wait_for_selector,
  wait_for_timeout,
  wait_for_load_state,
  wait_for_function,
};
