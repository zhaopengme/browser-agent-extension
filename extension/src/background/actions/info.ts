/**
 * Info actions: screenshot, extract, evaluate, get_page_info
 */

import type { ActionHandler } from '../router';
import { requireParam } from '../utils/validate';

const screenshot: ActionHandler = async ({ page, params }) => {
  const format = (params.format as string) || 'png';
  const quality = (params.quality as number) ?? 80;
  const fullPage = params.fullPage as boolean;
  const maxWidth = params.maxWidth as number | undefined;

  const viewport = await page.getViewportSize();
  let clip = undefined;

  if (maxWidth && viewport.width > maxWidth) {
    const scale = maxWidth / viewport.width;
    clip = {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
      scale: scale,
    };
  }

  const image = await page.captureScreenshot({
    format: format as 'png' | 'jpeg' | 'webp',
    quality,
    captureBeyondViewport: fullPage,
    clip,
  });

  return { image, width: viewport.width, height: viewport.height };
};

const extract: ActionHandler = async ({ page, params }) => {
  const selector = requireParam<string>(params, 'selector', 'string');

  const result = await page.evaluate<{ text: string; html: string }>(`
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Element not found');
      return {
        text: el.textContent?.trim() || '',
        html: el.outerHTML
      };
    })()
  `);
  return result;
};

const evaluate: ActionHandler = async ({ page, params }) => {
  const script = requireParam<string>(params, 'script', 'string');

  const scriptPreview = script.length > 200 ? script.slice(0, 200) + '...' : script;
  console.log(`[Background] Executing script (${script.length} chars): ${scriptPreview}`);

  const result = await page.evaluate(script);

  const resultStr = typeof result === 'string' ? result : JSON.stringify(result) ?? 'undefined';
  const resultPreview = resultStr.length > 500 ? resultStr.slice(0, 500) + '...' : resultStr;
  console.log(`[Background] Script result (${resultStr.length} chars): ${resultPreview}`);

  return { result };
};

const get_page_info: ActionHandler = async ({ page }) => {
  return page.getPageInfo();
};

export const infoHandlers: Record<string, ActionHandler> = {
  screenshot,
  extract,
  evaluate,
  get_page_info,
};
