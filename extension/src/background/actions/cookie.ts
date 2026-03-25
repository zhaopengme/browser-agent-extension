/**
 * Cookie management actions: get_cookies, set_cookie, delete_cookies
 * Uses CDP Network domain for full cookie attribute access (domain, httpOnly, etc.)
 */

import type { ActionHandler } from '../router';
import type { CookiePartitionKey } from '@/types/cdp';
import { requireParam, requireOneOf } from '../utils/validate';
import { BrowserAgentError } from '@/types/errors';

const get_cookies: ActionHandler = async ({ page, params }) => {
  const urls = params.urls as string[] | undefined;
  const cookies = await page.getCookies(urls);
  return { cookies, count: cookies.length };
};

const set_cookie: ActionHandler = async ({ page, params }) => {
  const name = requireParam<string>(params, 'name', 'string');
  const value = requireParam<string>(params, 'value', 'string');
  requireOneOf(params, ['url', 'domain']);

  if (params.url && params.domain) {
    throw new BrowserAgentError('Provide either url or domain, not both', 'INVALID_PARAMS');
  }

  const success = await page.setCookie({
    name,
    value,
    url: params.url as string | undefined,
    domain: params.domain as string | undefined,
    path: params.path as string | undefined,
    secure: params.secure as boolean | undefined,
    httpOnly: params.httpOnly as boolean | undefined,
    sameSite: params.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
    expires: params.expires as number | undefined,
    partitionKey: params.partitionKey as CookiePartitionKey | undefined,
  });

  return { success };
};

const delete_cookies: ActionHandler = async ({ page, params }) => {
  const name = requireParam<string>(params, 'name', 'string');

  await page.deleteCookies({
    name,
    url: params.url as string | undefined,
    domain: params.domain as string | undefined,
    path: params.path as string | undefined,
    partitionKey: params.partitionKey as CookiePartitionKey | undefined,
  });

  return { deleted: true };
};

export const cookieHandlers: Record<string, ActionHandler> = {
  get_cookies,
  set_cookie,
  delete_cookies,
};
