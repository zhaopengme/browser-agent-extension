/**
 * Navigation actions: navigate, go_back, go_forward, reload
 */

import type { ActionHandler } from '../router';
import { requireParam } from '../utils/validate';

const navigate: ActionHandler = async ({ page, params }) => {
  const url = requireParam<string>(params, 'url', 'string');

  try {
    await page.navigateTo(url);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  } catch {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  }

  await page.ensureConnected();

  const info = await page.getPageInfo();
  return { url: info.url, title: info.title };
};

const go_back: ActionHandler = async ({ page }) => {
  try {
    await page.goBack();
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  } catch {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  }
  await page.ensureConnected();
  return { navigated: true };
};

const go_forward: ActionHandler = async ({ page }) => {
  try {
    await page.goForward();
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  } catch {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  }
  await page.ensureConnected();
  return { navigated: true };
};

const reload: ActionHandler = async ({ page }) => {
  try {
    await page.reload();
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  } catch {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  }
  await page.ensureConnected();
  return { reloaded: true };
};

export const navigationHandlers: Record<string, ActionHandler> = {
  navigate,
  go_back,
  go_forward,
  reload,
};
