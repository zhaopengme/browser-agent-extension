/**
 * Interaction actions: click, type, scroll, press_key, blur, select_option
 */

import { sendContentCommand } from '../utils/content-bridge';
import type { ActionHandler } from '../router';
import { requireParam, requireOneOf } from '../utils/validate';
import { BrowserAgentError } from '@/types/errors';

const click: ActionHandler = async ({ page, params, tabId }) => {
  const humanLike = params.humanLike !== false;
  if (params.index !== undefined) {
    const result = await sendContentCommand<{ tagName?: string; text?: string }>(
      'CLICK_BY_INDEX',
      { index: params.index, humanLike },
      tabId
    );
    return { clicked: true, tagName: result.tagName, text: result.text };
  } else if (params.selector) {
    const result = await page.clickElement(params.selector as string, { humanLike });
    return { clicked: true, element: result };
  } else if (params.x !== undefined) {
    if (params.y === undefined) {
      throw new BrowserAgentError('y is required when x is provided', 'INVALID_PARAMS');
    }
    await page.clickAt(params.x as number, params.y as number, {
      button: params.button as 'left' | 'right' | 'middle',
      clickCount: params.clickCount as number,
      humanLike,
    });
    return { clicked: true };
  }
  requireOneOf(params, ['index', 'selector', 'x']);
  throw new BrowserAgentError('One of index, selector, or (x,y) coordinates is required', 'INVALID_PARAMS');
};

const type: ActionHandler = async ({ page, params, tabId }) => {
  const text = requireParam<string>(params, 'text', 'string');

  if (params.index !== undefined) {
    const result = await sendContentCommand<{ tagName?: string }>(
      'TYPE_BY_INDEX',
      { index: params.index, text, clearFirst: params.clearFirst },
      tabId
    );
    return { typed: true, length: text.length, tagName: result.tagName };
  } else if (params.selector) {
    await page.typeInElement(params.selector as string, text, {
      clearFirst: params.clearFirst as boolean,
      delay: params.delay as number,
    });
    return { typed: true, length: text.length };
  } else {
    const result = await sendContentCommand<{ tagName?: string }>(
      'TYPE_IN_FOCUSED',
      { text, clearFirst: params.clearFirst },
      tabId
    );
    return { typed: true, length: text.length, tagName: result.tagName };
  }
};

const scroll: ActionHandler = async ({ page, params }) => {
  if (params.selector) {
    await page.scrollToElement(params.selector as string);
    return { scrolled: true };
  } else if (params.x !== undefined && params.y !== undefined) {
    await page.scrollTo(params.x as number, params.y as number);
    return { scrolled: true };
  } else {
    const direction = (params.direction as string) || 'down';
    const distance = (params.distance as number) || 500;
    const pos = await page.scroll(direction as 'up' | 'down' | 'left' | 'right', distance);
    return { scrollX: pos.x, scrollY: pos.y };
  }
};

const press_key: ActionHandler = async ({ page, params }) => {
  const key = requireParam<string>(params, 'key', 'string');
  await page.pressKey(key);
  return { pressed: true, key };
};

const blur: ActionHandler = async ({ page: _page, params, tabId }) => {
  const result = await sendContentCommand<{ tagName?: string }>(
    'BLUR_ELEMENT',
    { index: params.index, selector: params.selector },
    tabId
  );
  return { blurred: true, tagName: result?.tagName };
};

const select_option: ActionHandler = async ({ page, params }) => {
  const selector = requireParam<string>(params, 'selector', 'string');
  const result = await page.selectOption(selector, {
    value: params.value as string,
    text: params.text as string,
    index: params.index as number,
  });
  return { selected: true, ...result };
};

export const interactionHandlers: Record<string, ActionHandler> = {
  click,
  type,
  scroll,
  press_key,
  blur,
  select_option,
};
