# Media Download Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `browser_download` tool to enable AI agents to download page resources with anti-hotlinking bypass.

**Architecture:** Service Worker handles download action, delegates to Content Script for page-context fetch when needed, then uses chrome.downloads API to save files. Filename uses timestamp format for uniqueness.

**Tech Stack:** TypeScript, Chrome Extension Manifest V3, chrome.downloads API, chrome.tabs messaging

---

## Task 1: Add Downloads Permission

**Files:**
- Modify: `extension/manifest.json`

**Step 1: Add downloads permission**

In `extension/manifest.json`, add `"downloads"` to the permissions array:

```json
{
  "permissions": [
    "sidePanel",
    "debugger",
    "tabs",
    "downloads"
  ]
}
```

**Step 2: Verify manifest is valid JSON**

Run: `cat extension/manifest.json | jq .`
Expected: Valid JSON output with downloads permission

**Step 3: Commit**

```bash
git add extension/manifest.json
git commit -m "feat(extension): add downloads permission for media download feature"
```

---

## Task 2: Add Message Types

**Files:**
- Modify: `extension/src/types/message.ts`

**Step 1: Add FETCH_RESOURCE message type**

Add the new message type to the `ContentMessage` union:

```typescript
// 资源获取（用于页面上下文下载）
| { type: 'FETCH_RESOURCE'; payload: { url: string } }
// 通过索引获取资源 URL
| { type: 'GET_RESOURCE_URL_BY_INDEX'; payload: { index: number } }
```

**Step 2: Verify TypeScript compiles**

Run: `cd extension && npm run build`
Expected: Build succeeds without errors

**Step 3: Commit**

```bash
git add extension/src/types/message.ts
git commit -m "feat(types): add FETCH_RESOURCE and GET_RESOURCE_URL_BY_INDEX message types"
```

---

## Task 3: Add Content Script Handlers

**Files:**
- Modify: `extension/src/content/index.ts`

**Step 1: Add helper function to extract resource URL from element**

Add before the message handler (around line 1590):

```typescript
/**
 * 从元素中提取资源 URL
 */
function getResourceUrlFromElement(el: Element): string | null {
  const tag = el.tagName.toLowerCase();

  // 图片
  if (tag === 'img') {
    return (el as HTMLImageElement).src || el.getAttribute('src');
  }

  // 视频
  if (tag === 'video') {
    const video = el as HTMLVideoElement;
    // 优先使用 currentSrc（实际播放的源）
    if (video.currentSrc) return video.currentSrc;
    // 其次使用 src 属性
    if (video.src) return video.src;
    // 查找 source 子元素
    const source = el.querySelector('source');
    if (source) return source.src || source.getAttribute('src');
  }

  // 音频
  if (tag === 'audio') {
    const audio = el as HTMLAudioElement;
    if (audio.currentSrc) return audio.currentSrc;
    if (audio.src) return audio.src;
    const source = el.querySelector('source');
    if (source) return source.src || source.getAttribute('src');
  }

  // 链接（可能指向文件）
  if (tag === 'a') {
    return (el as HTMLAnchorElement).href || el.getAttribute('href');
  }

  // source 元素
  if (tag === 'source') {
    return (el as HTMLSourceElement).src || el.getAttribute('src');
  }

  // 背景图片
  const style = window.getComputedStyle(el);
  const bgImage = style.backgroundImage;
  if (bgImage && bgImage !== 'none') {
    const match = bgImage.match(/url\(["']?(.+?)["']?\)/);
    if (match) return match[1];
  }

  return null;
}

/**
 * 通过索引获取资源 URL
 */
function getResourceUrlByIndex(index: number): ContentResponse<{ url: string; tagName: string }> {
  const el = getElementByIndex(index);
  if (!el) {
    return { success: false, error: `Element with index ${index} not found. Please refresh DOM tree first.` };
  }

  const url = getResourceUrlFromElement(el);
  if (!url) {
    return { success: false, error: `Element has no downloadable resource URL` };
  }

  return {
    success: true,
    data: {
      url,
      tagName: el.tagName.toLowerCase(),
    },
  };
}

/**
 * 在页面上下文中获取资源（绕过反盗链）
 */
async function fetchResourceInPageContext(url: string): Promise<ContentResponse<{ base64: string; mimeType: string }>> {
  try {
    const response = await fetch(url, {
      credentials: 'include',  // 包含 cookies
      mode: 'cors',
    });

    if (!response.ok) {
      return { success: false, error: `Fetch failed: ${response.status} ${response.statusText}` };
    }

    const blob = await response.blob();
    const mimeType = blob.type || 'application/octet-stream';

    // 转换为 base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // 提取 base64 部分（去掉 data:mime;base64, 前缀）
        const base64Data = dataUrl.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return {
      success: true,
      data: { base64, mimeType },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch resource',
    };
  }
}
```

**Step 2: Add message handlers in switch statement**

In the message handler switch statement (around line 1690), add these cases before the `default` case:

```typescript
case 'GET_RESOURCE_URL_BY_INDEX':
  response = getResourceUrlByIndex(message.payload.index);
  break;

case 'FETCH_RESOURCE':
  // 异步处理
  fetchResourceInPageContext(message.payload.url)
    .then(sendResponse);
  return true;  // 保持消息通道打开
```

**Step 3: Verify TypeScript compiles**

Run: `cd extension && npm run build`
Expected: Build succeeds without errors

**Step 4: Commit**

```bash
git add extension/src/content/index.ts
git commit -m "feat(content): add resource URL extraction and page context fetch handlers"
```

---

## Task 4: Add Download Action Handler in Service Worker

**Files:**
- Modify: `extension/src/background/index.ts`

**Step 1: Add helper functions for download**

Add after the `blurElement` function (around line 680):

```typescript
/**
 * 从 URL 提取文件扩展名
 */
function getExtensionFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    if (match) return match[1].toLowerCase();
  } catch {
    // URL 解析失败
  }
  return '';
}

/**
 * 从 MIME 类型推断扩展名
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/ico': 'ico',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'weba',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/json': 'json',
    'text/plain': 'txt',
    'text/html': 'html',
    'text/css': 'css',
    'text/javascript': 'js',
  };
  return mimeMap[mimeType] || '';
}

/**
 * 生成下载文件名
 */
function generateDownloadFilename(url: string, mimeType?: string): string {
  const timestamp = Date.now();

  // 尝试从 URL 获取扩展名
  let ext = getExtensionFromUrl(url);

  // 如果 URL 没有扩展名，尝试从 MIME 类型推断
  if (!ext && mimeType) {
    ext = getExtensionFromMimeType(mimeType);
  }

  // 兜底扩展名
  if (!ext) {
    ext = 'bin';
  }

  return `${timestamp}.${ext}`;
}

/**
 * 通过索引获取资源 URL
 */
async function getResourceUrlByIndex(index: number): Promise<{ url: string; tagName: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  await ensureContentScriptInjected(tab.id);

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: 'GET_RESOURCE_URL_BY_INDEX',
    payload: { index },
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to get resource URL');
  }

  return response.data;
}

/**
 * 在页面上下文中获取资源
 */
async function fetchResourceInPageContext(url: string): Promise<{ base64: string; mimeType: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  await ensureContentScriptInjected(tab.id);

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: 'FETCH_RESOURCE',
    payload: { url },
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to fetch resource');
  }

  return response.data;
}

/**
 * 下载资源
 */
async function downloadResource(params: {
  url?: string;
  index?: number;
  selector?: string;
}): Promise<{ success: boolean; filename: string; downloadId: number }> {
  let resourceUrl: string;
  let mimeType: string | undefined;
  let usePageContextFetch = false;

  // 1. 解析参数获取目标 URL
  if (params.index !== undefined) {
    const result = await getResourceUrlByIndex(params.index);
    resourceUrl = result.url;
    usePageContextFetch = true;  // 通过索引定位的资源优先使用页面上下文
  } else if (params.selector) {
    // 通过选择器获取
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');

    await ensureContentScriptInjected(tab.id);

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'EXECUTE_SCRIPT',
      payload: {
        script: `
          (function() {
            const el = document.querySelector(${JSON.stringify(params.selector)});
            if (!el) return null;
            const tag = el.tagName.toLowerCase();
            if (tag === 'img') return el.src;
            if (tag === 'video' || tag === 'audio') return el.currentSrc || el.src;
            if (tag === 'a') return el.href;
            if (tag === 'source') return el.src;
            return null;
          })()
        `,
      },
    });

    if (!response.success || !response.data) {
      throw new Error(`Element not found or has no resource URL: ${params.selector}`);
    }
    resourceUrl = response.data;
    usePageContextFetch = true;
  } else if (params.url) {
    resourceUrl = params.url;
    // 直接 URL 不使用页面上下文（可能是跨域资源）
    usePageContextFetch = false;
  } else {
    throw new Error('Provide one of: url, index, or selector');
  }

  // 2. 获取资源
  let downloadUrl: string;

  if (usePageContextFetch) {
    try {
      // 尝试页面上下文获取
      const result = await fetchResourceInPageContext(resourceUrl);
      mimeType = result.mimeType;

      // 创建 data URL
      downloadUrl = `data:${mimeType};base64,${result.base64}`;
    } catch {
      // 页面上下文获取失败，回退到直接下载
      downloadUrl = resourceUrl;
    }
  } else {
    downloadUrl = resourceUrl;
  }

  // 3. 生成文件名
  const filename = generateDownloadFilename(resourceUrl, mimeType);

  // 4. 执行下载
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: downloadUrl,
        filename: filename,
        saveAs: false,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (downloadId === undefined) {
          reject(new Error('Download failed to start'));
          return;
        }

        resolve({
          success: true,
          filename,
          downloadId,
        });
      }
    );
  });
}
```

**Step 2: Add download action case in executeAction switch**

In the `executeAction` function's switch statement, add a new case before the `default` case (around line 510):

```typescript
// ========== 资源下载 ==========

case 'download': {
  const result = await downloadResource({
    url: params.url as string | undefined,
    index: params.index as number | undefined,
    selector: params.selector as string | undefined,
  });
  return result;
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd extension && npm run build`
Expected: Build succeeds without errors

**Step 4: Commit**

```bash
git add extension/src/background/index.ts
git commit -m "feat(background): add download action handler with page context fetch support"
```

---

## Task 5: Add MCP Tool Definition

**Files:**
- Modify: `mcp-server/src/index.ts`

**Step 1: Add browser_download tool definition**

Add to the TOOLS array (after `browser_right_click` tool, around line 730):

```typescript
// ========== 资源下载 ==========
{
  name: 'browser_download',
  description: `Download a page resource (image, video, audio, file) to local.

Supports three ways to specify the resource:
1. By element index (recommended): Use the index from browser_get_dom_tree output
2. By CSS selector: Locate the media element with a CSS selector
3. By URL: Direct download from a URL

For resources on the current page (index/selector), uses page context fetch to bypass anti-hotlinking.
Files are saved to Chrome's default download directory with timestamp-based filenames.

Example workflow:
1. browser_get_dom_tree → Find [3] img "Logo" @(10,10,200,50)
2. browser_download({ index: 3 }) → Downloads the image

Returns: { success: true, filename: "1706284800123.png", downloadId: 42 }`,
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Resource URL for direct download' },
      index: { type: 'number', description: 'Element index from browser_get_dom_tree output (recommended)' },
      selector: { type: 'string', description: 'CSS selector to locate the media element' },
    },
  },
},
```

**Step 2: Add action mapping**

In the `getActionFromToolName` function's mapping object (around line 795), add:

```typescript
// 资源下载
browser_download: 'download',
```

**Step 3: Verify TypeScript compiles**

Run: `cd mcp-server && npm run build`
Expected: Build succeeds without errors

**Step 4: Commit**

```bash
git add mcp-server/src/index.ts
git commit -m "feat(mcp): add browser_download tool for resource downloading"
```

---

## Task 6: Build and Test

**Step 1: Build both packages**

Run:
```bash
cd /home/zhaopeng/projects/github/ai-memory/browser-agent-extension
cd extension && npm run build && cd ../mcp-server && npm run build
```
Expected: Both builds succeed

**Step 2: Manual integration test**

1. Load the extension in Chrome (chrome://extensions → Load unpacked → select `extension/dist`)
2. Open a webpage with images
3. Open the extension side panel
4. Use the MCP server to call:
   - `browser_get_dom_tree` - verify images are listed with indices
   - `browser_download({ index: N })` - verify download starts
   - `browser_download({ url: "https://example.com/image.png" })` - verify direct URL download

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete browser_download implementation

- Add downloads permission to manifest
- Add FETCH_RESOURCE message type for page context fetch
- Add resource URL extraction and fetch handlers in content script
- Add download action with anti-hotlinking bypass in service worker
- Add browser_download MCP tool definition

Closes: media download feature"
```

---

## Summary

| Task | Files Modified | Purpose |
|------|---------------|---------|
| 1 | manifest.json | Add downloads permission |
| 2 | types/message.ts | Add message types |
| 3 | content/index.ts | Add resource extraction and page context fetch |
| 4 | background/index.ts | Add download action handler |
| 5 | mcp-server/index.ts | Add MCP tool definition |
| 6 | - | Build and test |

Total estimated changes: ~250 lines of code across 4 files.
