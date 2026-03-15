/**
 * Index-based element interaction: click, type, blur
 */

import type { ContentResponse } from '@/types/message';
import { getElementByIndex } from './state';
import { getAccessibleName } from './dom-tree-compact';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 拟人化点击：平滑滚动 + 随机延迟 + mousedown → 间隔 → mouseup → click
 */
async function humanLikeClick(el: HTMLElement): Promise<void> {
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  await delay(randomInt(350, 550));

  await delay(randomInt(50, 120));
  if (!document.contains(el)) {
    throw new Error('Element was removed from DOM during human-like click delay');
  }
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2 + randomInt(-3, 3);
  const y = rect.top + rect.height / 2 + randomInt(-3, 3);

  const opts: MouseEventInit = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  await delay(randomInt(30, 70));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.click();
}

/**
 * 按索引点击元素。humanLike 为 true 时模拟真人：平滑滚动、随机延迟、完整鼠标事件序列。
 * 返回 Promise，调用方需 await 或 .then(sendResponse)。
 */
export async function clickElementByIndex(
  index: number,
  humanLike?: boolean
): Promise<ContentResponse<{ tagName: string; text: string }>> {
  const el = getElementByIndex(index);
  if (!el) {
    return { success: false, error: `Element with index ${index} not found. Please refresh DOM tree first.` };
  }

  try {
    if (humanLike) {
      await humanLikeClick(el as HTMLElement);
    } else {
      el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      (el as HTMLElement).click();
    }
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
