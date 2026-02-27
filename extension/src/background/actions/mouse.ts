/**
 * Advanced mouse actions: hover, double_click, right_click
 */

import type { ActionHandler } from '../router';
import { requireParam } from '../utils/validate';

const hover: ActionHandler = async ({ page, params }) => {
  const selector = requireParam<string>(params, 'selector', 'string');
  await page.hover(selector);
  return { hovered: true, selector };
};

const double_click: ActionHandler = async ({ page, params }) => {
  const selector = requireParam<string>(params, 'selector', 'string');
  await page.doubleClick(selector);
  return { doubleClicked: true, selector };
};

const right_click: ActionHandler = async ({ page, params }) => {
  const selector = requireParam<string>(params, 'selector', 'string');
  await page.rightClick(selector);
  return { rightClicked: true, selector };
};

export const mouseHandlers: Record<string, ActionHandler> = {
  hover,
  double_click,
  right_click,
};
