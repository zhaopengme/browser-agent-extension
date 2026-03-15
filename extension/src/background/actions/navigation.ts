/**
 * Navigation actions: navigate, go_back, go_forward, reload
 */

import type { ActionHandler } from '../router';
import { requireParam } from '../utils/validate';

async function waitForLoad(page: Parameters<ActionHandler>[0]['page']): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  await page.ensureConnected();
}

const navigate: ActionHandler = async ({ page, params }) => {
  const url = requireParam<string>(params, 'url', 'string');
  await page.navigateTo(url);
  await waitForLoad(page);
  const info = await page.getPageInfo();
  return { url: info.url, title: info.title };
};

const go_back: ActionHandler = async ({ page }) => {
  await page.goBack();
  await waitForLoad(page);
  return { navigated: true };
};

const go_forward: ActionHandler = async ({ page }) => {
  await page.goForward();
  await waitForLoad(page);
  return { navigated: true };
};

const reload: ActionHandler = async ({ page }) => {
  await page.reload();
  await waitForLoad(page);
  return { reloaded: true };
};

export const navigationHandlers: Record<string, ActionHandler> = {
  navigate,
  go_back,
  go_forward,
  reload,
};
