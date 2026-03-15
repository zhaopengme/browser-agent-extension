/**
 * Resource URL extraction and fetching in page context
 */

import type { ContentResponse } from '@/types/message';
import { getElementByIndex } from './state';

function getResourceUrlFromElement(element: Element): string | null {
  const tag = element.tagName.toLowerCase();

  switch (tag) {
    case 'img':
      return element.getAttribute('src') || element.getAttribute('data-src') || null;
    case 'video':
      return element.getAttribute('src') || element.getAttribute('data-src') ||
             element.querySelector('source')?.getAttribute('src') || null;
    case 'audio':
      return element.getAttribute('src') || element.getAttribute('data-src') ||
             element.querySelector('source')?.getAttribute('src') || null;
    case 'a': {
      const href = element.getAttribute('href');
      if (href && (href.match(/\.(jpg|jpeg|png|gif|webp|svg|mp4|mp3|wav|ogg|pdf|zip|rar)$/i) ||
                   href.includes('download') || element.getAttribute('download'))) {
        return href;
      }
      return null;
    }
    case 'source':
      return element.getAttribute('src') || null;
    default: {
      const style = window.getComputedStyle(element);
      const bgImage = style.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const match = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
        return match ? match[1] : null;
      }
      return null;
    }
  }
}

export function getResourceUrlByIndex(index: number): ContentResponse<string> {
  if (!Number.isInteger(index) || index < 0) {
    return { success: false, error: `Invalid index: ${index}. Index must be a non-negative integer.` };
  }

  const element = getElementByIndex(index);
  if (!element) {
    return { success: false, error: `Element with index ${index} not found. Please refresh DOM tree first.` };
  }

  const url = getResourceUrlFromElement(element);
  if (!url) {
    return { success: false, error: `No resource URL found for element at index ${index}` };
  }

  try {
    const absoluteUrl = new URL(url, window.location.href).href;
    return { success: true, data: absoluteUrl };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : `Invalid URL: ${url}`
    };
  }
}

export async function fetchResourceInPageContext(url: string): Promise<ContentResponse<{ blob: string; contentType: string; size: number }>> {
  if (!url || typeof url !== 'string') {
    return { success: false, error: 'Invalid URL: URL must be a non-empty string' };
  }

  try {
    new URL(url);
  } catch {
    return { success: false, error: `Invalid URL format: ${url}` };
  }

  try {
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Referer': window.location.href,
      },
    });

    if (!response.ok) {
      return { success: false, error: `Failed to fetch resource: ${response.status} ${response.statusText}` };
    }

    const blob = await response.blob();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        try {
          if (typeof reader.result === 'string') {
            const base64Parts = reader.result.split(',');
            if (base64Parts.length !== 2) {
              reject(new Error('Invalid base64 format'));
              return;
            }
            const base64 = base64Parts[1];
            resolve(base64);
          } else {
            reject(new Error('Failed to convert blob to base64'));
          }
        } finally {
          reader.onloadend = null;
          reader.onerror = null;
        }
      };
      reader.onerror = (error) => {
        reader.onloadend = null;
        reader.onerror = null;
        reject(new Error('FileReader error: ' + ((error.target as FileReader)?.error?.message || 'Unknown error')));
      };
    });

    reader.readAsDataURL(blob);
    const base64Data = await base64Promise;

    return {
      success: true,
      data: {
        blob: base64Data,
        contentType,
        size: blob.size,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch resource',
    };
  }
}
