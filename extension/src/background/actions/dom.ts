/**
 * DOM actions: get_dom_tree, get_dom_tree_full, get_dom_tree_structured, get_dom_tree_aria, markdown
 */

import { sendContentCommand } from '../utils/content-bridge';
import type { ActionHandler } from '../router';

const get_dom_tree: ActionHandler = async ({ params, tabId }) => {
  return sendContentCommand('GET_DOM_TREE', params, tabId);
};

const get_dom_tree_full: ActionHandler = async ({ params, tabId }) => {
  const selector = params.selector as string | undefined;
  const data = await sendContentCommand('GET_DOM_TREE_FULL', { selector }, tabId);
  return { tree: data, selector: selector || 'body' };
};

const get_dom_tree_structured: ActionHandler = async ({ params, tabId }) => {
  return sendContentCommand('GET_DOM_TREE_STRUCTURED', params, tabId);
};

const get_dom_tree_aria: ActionHandler = async ({ params, tabId }) => {
  return sendContentCommand('GET_DOM_TREE_ARIA', params, tabId);
};

const markdown: ActionHandler = async ({ params, tabId }) => {
  const selector = params.selector as string | undefined;
  return sendContentCommand<{ markdown: string; title: string; url: string; truncated?: boolean }>(
    'GET_MARKDOWN',
    { selector },
    tabId
  );
};

export const domHandlers: Record<string, ActionHandler> = {
  get_dom_tree,
  get_dom_tree_full,
  get_dom_tree_structured,
  get_dom_tree_aria,
  markdown,
};
