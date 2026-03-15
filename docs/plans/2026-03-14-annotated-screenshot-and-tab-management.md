# Annotated Screenshot & Tab Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two new features — annotated screenshots with element index overlays, and tab create/close management.

**Architecture:** Annotated screenshot injects temporary DOM annotations via content script, takes CDP screenshot, then removes annotations. Tab management adds `create_tab` and `close_tab` handlers using Chrome extension APIs. Both features follow the existing pattern: MCP tool schema → tool-to-action mapping → background action handler → (content script or chrome API).

**Tech Stack:** TypeScript, Chrome Extension APIs, CDP, Bun MCP Server

---

## Feature 1: Tab Create/Close

### Task 1: Add create_tab and close_tab handlers in extension

**Files:**
- Modify: `extension/src/background/actions/tabs.ts`

**Step 1: Add the two new handlers**

```typescript
/**
 * Tab management actions: get_tabs, switch_tab, create_tab, close_tab
 * These don't require a Page instance — they operate on browserContext directly.
 */

import { browserContext } from '@/cdp';
import type { NoPageActionHandler } from '../router';
import { requireParam } from '../utils/validate';

const get_tabs: NoPageActionHandler = async () => {
  const tabs = await browserContext.getAllTabsInfo();
  return { tabs };
};

const switch_tab: NoPageActionHandler = async (params) => {
  const tabId = requireParam<number>(params, 'tabId', 'number');
  await browserContext.switchToTab(tabId);
  return { switched: true };
};

const create_tab: NoPageActionHandler = async (params) => {
  const url = (params.url as string) || 'about:blank';
  const background = (params.background as boolean) || false;

  const tab = await chrome.tabs.create({ url, active: !background });

  if (!tab.id) {
    throw new Error('Failed to create tab — no tab ID returned');
  }

  return { tabId: tab.id, url: tab.url || url };
};

const close_tab: NoPageActionHandler = async (params) => {
  let tabId = params.tabId as number | undefined;

  // Default to current active tab
  if (!tabId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      throw new Error('No active tab found');
    }
    tabId = activeTab.id;
  }

  // Check if we're closing the active tab — need to switch to another
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isClosingActiveTab = activeTab?.id === tabId;

  // Get all tabs before closing, to find the most recent one to switch to
  let nextTabId: number | undefined;
  if (isClosingActiveTab) {
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    // Sort by lastAccessed descending, pick first that isn't the one being closed
    const candidates = allTabs
      .filter(t => t.id !== tabId && t.id !== undefined)
      .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    nextTabId = candidates[0]?.id;
  }

  await chrome.tabs.remove(tabId);

  // Switch to the most recently used tab
  if (isClosingActiveTab && nextTabId) {
    await chrome.tabs.update(nextTabId, { active: true });
  }

  return { closed: true, activeTabId: nextTabId ?? activeTab?.id };
};

export const tabHandlers: Record<string, NoPageActionHandler> = {
  get_tabs,
  switch_tab,
  create_tab,
  close_tab,
};
```

**Step 2: Commit**

```bash
git add extension/src/background/actions/tabs.ts
git commit -m "feat: add create_tab and close_tab action handlers"
```

---

### Task 2: Register MCP tools and action mapping for tab management

**Files:**
- Modify: `mcp-server/src/mcp/server.ts` — add tool schemas after existing tab tools
- Modify: `mcp-server/src/mcp/tools/index.ts` — add mapping entries

**Step 1: Add tool schemas in server.ts**

Find the existing `browser_switch_tab` tool definition (around line 100) and add after it:

```typescript
  browser_create_tab: {
    description: 'Create a new browser tab. Switches to it by default. Use background param to keep current tab active.',
    schema: z.object({
      url: z.string().optional().describe('URL to open, defaults to about:blank'),
      background: z.boolean().optional().describe('If true, open in background without switching to it'),
    }),
  },
  browser_close_tab: {
    description: 'Close a browser tab. Defaults to current active tab. When closing the active tab, automatically switches to the most recently used tab.',
    schema: z.object({
      tabId: z.number().optional().describe('Tab ID to close. Defaults to current active tab.'),
    }),
  },
```

**Step 2: Add mapping in tools/index.ts**

Add these two lines inside the `mapping` object in `getActionFromToolName`:

```typescript
    browser_create_tab: 'create_tab',
    browser_close_tab: 'close_tab',
```

**Step 3: Run tests**

```bash
cd mcp-server && bun test
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add mcp-server/src/mcp/server.ts mcp-server/src/mcp/tools/index.ts
git commit -m "feat: register browser_create_tab and browser_close_tab MCP tools"
```

---

## Feature 2: Annotated Screenshot

### Task 3: Create annotation module in content script

**Files:**
- Create: `extension/src/content/annotate.ts`

**Step 1: Create the annotation module**

This module creates temporary DOM overlays showing element indices with borders and number labels, then removes them on demand.

```typescript
/**
 * Annotate module - creates visual overlays on interactive elements
 * showing their index numbers for annotated screenshots.
 */

import { buildCompactDomTree } from './dom-tree-compact';
import { elementIndexMap } from './state';

const CONTAINER_ID = 'agents-cc-annotations';

interface AnnotationInfo {
  index: number;
  tag: string;
  role?: string;
  name: string;
  rect: { x: number; y: number; width: number; height: number };
}

/**
 * Build DOM tree, then create visual annotation overlays for all indexed elements.
 * Returns the element list for the AI.
 */
export function createAnnotations(options?: {
  selector?: string;
  maxDepth?: number;
}): { domTree: string; elements: AnnotationInfo[] } {
  // Remove any existing annotations first
  removeAnnotations();

  // Build the DOM tree (this populates elementIndexMap)
  const domTree = buildCompactDomTree({
    selector: options?.selector,
    maxDepth: options?.maxDepth,
  });

  // Create annotation container
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  document.documentElement.appendChild(container);

  const elements: AnnotationInfo[] = [];

  elementIndexMap.forEach((el, index) => {
    const rect = el.getBoundingClientRect();

    // Skip elements not in viewport or too small
    if (
      rect.width < 2 || rect.height < 2 ||
      rect.bottom < 0 || rect.top > window.innerHeight ||
      rect.right < 0 || rect.left > window.innerWidth
    ) {
      return;
    }

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || undefined;
    const name = getElementName(el);

    elements.push({
      index,
      tag,
      role,
      name,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });

    // Create border overlay
    const border = document.createElement('div');
    border.style.cssText = `
      position:fixed;
      left:${rect.left}px;
      top:${rect.top}px;
      width:${rect.width}px;
      height:${rect.height}px;
      border:2px solid rgba(255,0,0,0.6);
      border-radius:2px;
      pointer-events:none;
      box-sizing:border-box;
    `;

    // Create index label at top-left corner
    const label = document.createElement('div');
    label.textContent = String(index);
    label.style.cssText = `
      position:absolute;
      left:-1px;
      top:-14px;
      background:rgba(255,0,0,0.85);
      color:#fff;
      font-size:10px;
      font-family:monospace;
      line-height:12px;
      padding:0 3px;
      border-radius:2px 2px 0 0;
      pointer-events:none;
      white-space:nowrap;
    `;

    border.appendChild(label);
    container.appendChild(border);
  });

  return { domTree, elements };
}

/**
 * Remove all annotation overlays from the page.
 */
export function removeAnnotations(): void {
  const container = document.getElementById(CONTAINER_ID);
  if (container) {
    container.remove();
  }
}

function getElementName(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.slice(0, 50);

  const text = el.textContent?.trim();
  if (text) return text.slice(0, 50);

  const alt = el.getAttribute('alt');
  if (alt) return alt.slice(0, 50);

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder.slice(0, 50);

  return el.tagName.toLowerCase();
}
```

**Step 2: Commit**

```bash
git add extension/src/content/annotate.ts
git commit -m "feat: add annotation overlay module for content script"
```

---

### Task 4: Wire annotation messages in content script router

**Files:**
- Modify: `extension/src/content/index.ts`
- Modify: `extension/src/types/message.ts` — add new message types

**Step 1: Check message.ts for the ContentMessage type definition**

Read `extension/src/types/message.ts` to see how message types are defined, then add `ANNOTATE_ELEMENTS` and `REMOVE_ANNOTATIONS` to the type union.

**Step 2: Add import and message handlers in content/index.ts**

Add import at the top:

```typescript
import { createAnnotations, removeAnnotations } from './annotate';
```

Add these cases before the `default:` case in the switch:

```typescript
      case 'ANNOTATE_ELEMENTS':
        try {
          const result = createAnnotations({
            selector: message.payload?.selector,
            maxDepth: message.payload?.maxDepth,
          });
          sendResponse({ success: true, data: result });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create annotations',
          });
        }
        return true;

      case 'REMOVE_ANNOTATIONS':
        removeAnnotations();
        sendResponse({ success: true });
        return true;
```

**Step 3: Commit**

```bash
git add extension/src/content/index.ts extension/src/types/message.ts
git commit -m "feat: wire annotation messages in content script router"
```

---

### Task 5: Add screenshot_annotated action handler in background

**Files:**
- Modify: `extension/src/background/actions/info.ts` — add `screenshot_annotated` handler

**Step 1: Add the handler**

Add import at top of `info.ts`:

```typescript
import { sendContentCommand } from '../utils/content-bridge';
```

Add after the existing `screenshot` handler:

```typescript
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
```

**Step 2: Add to exports**

Update the `infoHandlers` export at the bottom of `info.ts`:

```typescript
export const infoHandlers: Record<string, ActionHandler> = {
  screenshot,
  screenshot_annotated,
  extract,
  evaluate,
  get_page_info,
};
```

**Step 3: Commit**

```bash
git add extension/src/background/actions/info.ts
git commit -m "feat: add screenshot_annotated action handler"
```

---

### Task 6: Register MCP tool and handle response in server

**Files:**
- Modify: `mcp-server/src/mcp/server.ts` — add tool schema + response handling
- Modify: `mcp-server/src/mcp/tools/index.ts` — add mapping

**Step 1: Add tool schema in server.ts**

Add after the `browser_screenshot` tool definition:

```typescript
  browser_screenshot_annotated: {
    description: 'Take an annotated screenshot with interactive elements highlighted and numbered. Returns file path and element index list. Use this instead of calling get_dom_tree + screenshot separately.',
    schema: z.object({
      fullPage: z.boolean().optional().describe('Capture full page including off-screen content, default false'),
      format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Image format, default png'),
      quality: z.number().min(1).max(100).optional().describe('JPEG/WebP quality (1-100), default 80'),
      maxWidth: z.number().optional().describe('Max width in pixels - scales down if page is wider'),
    }),
  },
```

**Step 2: Add screenshot defaults for the annotated tool**

Find the screenshot defaults block (around line 368) and extend it:

```typescript
        // Apply screenshot defaults to reduce file size (~3.5MB PNG → ~200-400KB JPEG)
        if (toolName === 'browser_screenshot' || toolName === 'browser_screenshot_annotated') {
          args = {
            format: 'jpeg',
            quality: 60,
            maxWidth: 1280,
            ...args,
          };
        }
```

**Step 3: Add response handling for annotated screenshot**

Find the screenshot special handling block (around line 386) and extend the condition:

```typescript
          // Special handling for screenshot - save to file instead of returning base64
          if ((toolName === 'browser_screenshot' || toolName === 'browser_screenshot_annotated') && result && typeof result === 'object') {
            // Extension may return direct { image, ... } or wrapped { success, data: { image, ... } }
            const raw = result as Record<string, unknown>;
            const screenshotResult = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as {
              image?: string;
              width?: number;
              height?: number;
              elements?: string;
              elementCount?: number;
            };
            if (screenshotResult.image) {
              const format = (args.format as 'png' | 'jpeg' | 'webp') || 'jpeg';
              const filePath = await saveScreenshot(screenshotResult.image, format);
              let text = `Screenshot saved: ${filePath}\nDimensions: ${screenshotResult.width}x${screenshotResult.height}\nFormat: ${format}`;
              if (screenshotResult.elements) {
                text += `\nElements (${screenshotResult.elementCount}): ${screenshotResult.elements}`;
              }
              return {
                content: [
                  {
                    type: 'text' as const,
                    text,
                  },
                ],
              };
            }
          }
```

**Step 4: Add mapping in tools/index.ts**

Add this line inside the `mapping` object:

```typescript
    browser_screenshot_annotated: 'screenshot_annotated',
```

**Step 5: Run tests**

```bash
cd mcp-server && bun test
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add mcp-server/src/mcp/server.ts mcp-server/src/mcp/tools/index.ts
git commit -m "feat: register browser_screenshot_annotated MCP tool with response handling"
```
