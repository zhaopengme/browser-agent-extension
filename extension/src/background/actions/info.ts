/**
 * Info actions: screenshot, extract, evaluate, get_page_info
 */

import type { ActionHandler } from '../router';
import { sendContentCommand } from '../utils/content-bridge';
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

const screenshot_annotated: ActionHandler = async ({ page, params }) => {
  const format = (params.format as string) || 'png';
  const quality = (params.quality as number) ?? 80;
  const fullPage = params.fullPage as boolean;
  const maxWidth = params.maxWidth as number | undefined;
  const tabId = page.getTabId();

  // Step 1: Inject annotations via content script
  const annotationResult = await sendContentCommand<{
    domTree: string;
    elements: Array<{
      index: number;
      tag: string;
      role?: string;
      name: string;
      rect: { x: number; y: number; width: number; height: number };
    }>;
  }>('ANNOTATE_ELEMENTS', {
    selector: params.selector,
    maxDepth: params.maxDepth,
  }, tabId);

  // Step 2: Take screenshot (with annotations visible)
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

  // Step 3: Remove annotations
  await sendContentCommand('REMOVE_ANNOTATIONS', undefined, tabId).catch(() => {});

  // Step 4: Format element summary for AI
  const elementSummary = annotationResult.elements
    .map(e => {
      const type = e.role || e.tag;
      return `[${e.index}] ${type} "${e.name}" @(${e.rect.x},${e.rect.y})`;
    })
    .join(' | ');

  return {
    image,
    width: viewport.width,
    height: viewport.height,
    elements: elementSummary,
    elementCount: annotationResult.elements.length,
  };
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
  screenshot_annotated,
  extract,
  evaluate,
  get_page_info,
};
