/**
 * Network capture actions
 */

import type { ActionHandler } from '../router';
import { requireParam } from '../utils/validate';

const enable_network: ActionHandler = async ({ page }) => {
  await page.enableNetworkCapture();
  return { enabled: true };
};

const disable_network: ActionHandler = async ({ page }) => {
  await page.disableNetworkCapture();
  return { disabled: true };
};

const get_network_requests: ActionHandler = async ({ page, params }) => {
  const requests = page.getNetworkRequests({
    urlPattern: params.urlPattern as string | undefined,
    method: params.method as string | undefined,
    statusCode: params.statusCode as number | undefined,
    resourceType: params.resourceType as string | undefined,
    clear: params.clear as boolean | undefined,
  });
  return { requests, count: requests.length };
};

const get_network_requests_with_response: ActionHandler = async ({ page, params }) => {
  const requests = await page.getNetworkRequestsWithResponse({
    urlPattern: params.urlPattern as string | undefined,
    method: params.method as string | undefined,
    statusCode: params.statusCode as number | undefined,
    resourceType: params.resourceType as string | undefined,
    clear: params.clear as boolean | undefined,
  });
  return { requests, count: requests.length };
};

const clear_network_requests: ActionHandler = async ({ page }) => {
  page.clearNetworkRequests();
  return { cleared: true };
};

const wait_for_response: ActionHandler = async ({ page, params }) => {
  const urlPattern = requireParam<string>(params, 'urlPattern', 'string');

  const response = await page.waitForResponse(urlPattern, {
    method: params.method as string | undefined,
    timeout: params.timeout as number | undefined,
  });

  if (response) {
    return { found: true, request: response };
  }
  return { found: false, timedOut: true };
};

export const networkHandlers: Record<string, ActionHandler> = {
  enable_network,
  disable_network,
  get_network_requests,
  get_network_requests_with_response,
  clear_network_requests,
  wait_for_response,
};
