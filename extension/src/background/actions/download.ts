/**
 * Download action and helpers
 */

import { sendContentCommand } from '../utils/content-bridge';
import type { ActionHandler } from '../router';
import { BrowserAgentError } from '@/types/errors';

function getExtensionFromUrl(url: string): string {
  try {
    const urlPath = new URL(url).pathname;
    const match = urlPath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    return match ? match[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/html': 'html',
    'application/json': 'json',
  };
  return mimeToExt[mimeType.toLowerCase()] || '';
}

function generateDownloadFilename(url: string, mimeType?: string): string {
  const timestamp = Date.now();
  let extension = getExtensionFromUrl(url);
  if (!extension && mimeType) {
    extension = getExtensionFromMimeType(mimeType);
  }
  if (!extension) {
    extension = 'bin';
  }
  return `${timestamp}.${extension}`;
}

async function fetchResourceInPageContext(
  url: string,
  tabId?: number
): Promise<{ url: string; blob: Blob }> {
  const result = await sendContentCommand<{ blob: string; contentType: string; size: number }>(
    'FETCH_RESOURCE',
    { url },
    tabId
  );

  const { blob: data, contentType: mimeType } = result;
  const byteCharacters = atob(data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });

  return { url, blob };
}

export const download: ActionHandler = async ({ params, tabId }) => {
  const { url: directUrl, index, selector } = params;

  let downloadUrl: string;
  let filename: string;

  if (directUrl) {
    downloadUrl = directUrl as string;
    filename = generateDownloadFilename(downloadUrl);
  } else if (index !== undefined) {
    const resourceUrl = await sendContentCommand<string>(
      'GET_RESOURCE_URL_BY_INDEX',
      { index },
      tabId
    );
    const { url, blob } = await fetchResourceInPageContext(resourceUrl, tabId);
    downloadUrl = URL.createObjectURL(blob);
    filename = generateDownloadFilename(url, blob.type);
  } else if (selector) {
    throw new BrowserAgentError(
      'Download by selector is not yet implemented. Please use index (from browser_get_dom_tree) or direct URL instead.',
      'INVALID_PARAMS'
    );
  } else {
    throw new BrowserAgentError('Either url, index, or selector is required', 'INVALID_PARAMS');
  }

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: downloadUrl,
      filename: filename,
      saveAs: false,
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new BrowserAgentError(
          chrome.runtime.lastError.message ?? 'Download failed',
          'PERMISSION_DENIED'
        ));
        return;
      }

      if (downloadUrl.startsWith('blob:')) {
        const listener = (delta: chrome.downloads.DownloadDelta) => {
          if (delta.id === downloadId && delta.state) {
            if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
              URL.revokeObjectURL(downloadUrl);
              chrome.downloads.onChanged.removeListener(listener);
            }
          }
        };
        chrome.downloads.onChanged.addListener(listener);

        setTimeout(() => {
          URL.revokeObjectURL(downloadUrl);
          chrome.downloads.onChanged.removeListener(listener);
        }, 60000);
      }

      resolve({ downloaded: true, filename, downloadId });
    });
  });
};

export const downloadHandlers: Record<string, ActionHandler> = {
  download,
};
