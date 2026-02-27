/**
 * Element utilities: getElementInfo, extractElements, scrollToElement, highlightElement
 */

import type { ContentResponse } from '@/types/message';

interface ElementInfo {
  tagName: string;
  text: string;
  html: string;
  rect: { x: number; y: number; width: number; height: number };
  visible: boolean;
  attributes: Record<string, string>;
}

interface ExtractedElement {
  index: number;
  tagName: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  attributes: Record<string, string>;
}

export function getElementInfo(selector: string): ContentResponse<ElementInfo> {
  try {
    const element = document.querySelector(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      success: true,
      data: {
        tagName: element.tagName.toLowerCase(),
        text: element.textContent?.trim().slice(0, 500) || '',
        html: element.outerHTML.slice(0, 2000),
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        visible: style.display !== 'none' && style.visibility !== 'hidden',
        attributes: Object.fromEntries(
          Array.from(element.attributes).map(a => [a.name, a.value])
        ),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function extractElements(
  selector: string,
  multiple: boolean,
  attributes?: string[]
): ContentResponse<ExtractedElement[]> {
  try {
    const elements = multiple
      ? Array.from(document.querySelectorAll(selector))
      : [document.querySelector(selector)].filter((e): e is Element => e !== null);

    const result: ExtractedElement[] = elements.map((el, idx) => {
      const rect = el.getBoundingClientRect();
      const attrs: Record<string, string> = {};

      if (attributes && attributes.length > 0) {
        for (const attr of attributes) {
          const value = el.getAttribute(attr);
          if (value !== null) {
            attrs[attr] = value;
          }
        }
      } else {
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
      }

      return {
        index: idx,
        tagName: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 500) || '',
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        attributes: attrs,
      };
    });

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function scrollToElement(selector: string): ContentResponse<boolean> {
  try {
    const element = document.querySelector(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function highlightElement(selector: string): ContentResponse<boolean> {
  try {
    document.querySelectorAll('.agents-cc-highlight').forEach(el => el.remove());

    const element = document.querySelector(selector);
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    const rect = element.getBoundingClientRect();

    const highlight = document.createElement('div');
    highlight.className = 'agents-cc-highlight';
    highlight.style.cssText = `
      position: fixed;
      left: ${rect.x}px;
      top: ${rect.y}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 2px solid #4CAF50;
      background: rgba(76, 175, 80, 0.2);
      pointer-events: none;
      z-index: 999999;
      transition: opacity 0.3s;
    `;

    document.body.appendChild(highlight);

    setTimeout(() => {
      highlight.style.opacity = '0';
      setTimeout(() => highlight.remove(), 300);
    }, 3000);

    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
