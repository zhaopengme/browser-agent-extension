/**
 * Dialog actions: get_dialog, handle_dialog, set_auto_dialog
 */

import type { ActionHandler } from '../router';

const get_dialog: ActionHandler = async ({ page }) => {
  const dialog = page.getDialog();
  if (dialog) {
    return { hasDialog: true, dialog };
  }
  return { hasDialog: false };
};

const handle_dialog: ActionHandler = async ({ page, params }) => {
  const accept = (params.accept as boolean) ?? true;
  const promptText = params.promptText as string | undefined;
  const handled = await page.handleDialog(accept, promptText);
  return { handled, accept };
};

const set_auto_dialog: ActionHandler = async ({ page, params }) => {
  const handler = params.handler as 'accept' | 'dismiss' | null;
  page.setAutoDialogHandler(handler);
  return { set: true, handler };
};

export const dialogHandlers: Record<string, ActionHandler> = {
  get_dialog,
  handle_dialog,
  set_auto_dialog,
};
