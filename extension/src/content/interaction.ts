/**
 * Index-based element interaction: click, type, blur
 */

import type { ContentResponse } from '@/types/message';
import { elementIndexMap } from './state';
import { getAccessibleName } from './dom-tree-compact';

function getElementByIndex(index: number): Element | undefined {
  const elementByAttr = document.querySelector(`[data-agent-index="${index}"]`);
  if (elementByAttr) {
    return elementByAttr;
  }
  return elementIndexMap.get(index);
}

export function clickElementByIndex(index: number): ContentResponse<{ tagName: string; text: string }> {
  const el = getElementByIndex(index);
  if (!el) {
    return { success: false, error: `Element with index ${index} not found. Please refresh DOM tree first.` };
  }

  try {
    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });

    (el as HTMLElement).click();

    return {
      success: true,
      data: {
        tagName: el.tagName.toLowerCase(),
        text: getAccessibleName(el).slice(0, 100),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to click element',
    };
  }
}

export function typeInElementByIndex(
  index: number,
  text: string,
  clearFirst: boolean = false
): ContentResponse<{ tagName: string }> {
  const el = getElementByIndex(index);
  if (!el) {
    return { success: false, error: `Element with index ${index} not found. Please refresh DOM tree first.` };
  }

  try {
    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });

    (el as HTMLElement).focus();

    const tag = el.tagName.toLowerCase();

    if (tag === 'input' || tag === 'textarea') {
      const inputEl = el as HTMLInputElement | HTMLTextAreaElement;

      if (clearFirst) {
        inputEl.value = '';
      }

      inputEl.value += text;

      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else if ((el as HTMLElement).isContentEditable || el.getAttribute('contenteditable') === 'true') {
      if (clearFirst) {
        el.textContent = '';
      }

      document.execCommand('insertText', false, text);
    } else {
      return { success: false, error: `Element is not editable: ${tag}` };
    }

    return {
      success: true,
      data: { tagName: tag },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to type in element',
    };
  }
}

export function blurElement(
  index?: number,
  selector?: string
): ContentResponse<{ tagName: string }> {
  try {
    let el: Element | null = null;

    if (index !== undefined) {
      el = getElementByIndex(index) || null;
      if (!el) {
        return { success: false, error: `Element with index ${index} not found. Please refresh DOM tree first.` };
      }
    } else if (selector) {
      el = document.querySelector(selector);
      if (!el) {
        return { success: false, error: `Element not found: ${selector}` };
      }
    } else {
      el = document.activeElement;
      if (!el || el === document.body) {
        return { success: true, data: { tagName: 'body' } };
      }
    }

    const tagName = el.tagName.toLowerCase();

    (el as HTMLElement).blur();

    return {
      success: true,
      data: { tagName },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to blur element',
    };
  }
}

export function typeInFocusedElement(
  text: string,
  clearFirst: boolean = false
): ContentResponse<{ tagName: string }> {
  const el = document.activeElement;
  if (!el || el === document.body) {
    return { success: false, error: 'No element is currently focused. Please click on an element first or use index parameter.' };
  }

  try {
    const tag = el.tagName.toLowerCase();

    if (tag === 'input' || tag === 'textarea') {
      const inputEl = el as HTMLInputElement | HTMLTextAreaElement;

      if (clearFirst) {
        inputEl.value = '';
      }

      inputEl.value += text;

      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else if ((el as HTMLElement).isContentEditable || el.getAttribute('contenteditable') === 'true') {
      if (clearFirst) {
        el.textContent = '';
      }

      document.execCommand('insertText', false, text);
    } else {
      return { success: false, error: `Focused element is not editable: ${tag}. Please use index parameter to specify the target element.` };
    }

    return {
      success: true,
      data: { tagName: tag },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to type in focused element',
    };
  }
}
