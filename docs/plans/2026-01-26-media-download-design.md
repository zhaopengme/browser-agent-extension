# Media Download Feature Design

Date: 2026-01-26

## Overview

Add a `browser_download` tool to enable AI agents to download page resources (images, videos, audio, files) to the user's local download directory.

## Requirements

- On-demand download: AI agent downloads resources based on user instructions
- Support all downloadable resources: images, videos, audio, PDFs, documents, etc.
- Save to Chrome's default download directory via `chrome.downloads` API
- Support multiple ways to specify resources: URL, CSS selector, element index
- Bypass anti-hotlinking by fetching resources within page context

## MCP Tool Specification

### `browser_download`

```typescript
{
  name: 'browser_download',
  description: 'Download a page resource to local. Supports URL, CSS selector, or element index.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Resource URL (direct download)' },
      index: { type: 'number', description: 'Element index from DOM tree' },
      selector: { type: 'string', description: 'CSS selector to locate media element' }
    }
  }
}
```

**Input:** One of `url`, `index`, or `selector` (mutually exclusive)

**Output:**
```typescript
// Success
{ success: true, filename: "1706284800123.jpg", downloadId: 42 }

// Failure
{ success: false, error: "Element not found: .nonexistent" }
```

## Filename Strategy

Format: `{timestamp}.{extension}`

- Timestamp: 13-digit millisecond timestamp (ensures uniqueness)
- Extension: Extracted from URL path, or inferred from MIME type, fallback to `.bin`

Examples:
| Resource | Filename |
|----------|----------|
| Image | `1706284800123.jpg` |
| Video | `1706284800456.mp4` |
| PDF | `1706284800789.pdf` |

## Download Strategy

### Anti-Hotlinking Bypass

Two-step approach:

1. **Primary: Page context fetch** - Use `fetch()` within page's JavaScript context
   - Inherits cookies, referer, session automatically
   - Bypasses most anti-hotlinking mechanisms
   - Used when resource is specified by selector/index

2. **Fallback: Direct download** - Use `chrome.downloads.download()` directly
   - For cross-origin resources or direct URL input
   - Sets Referer header to current page URL

### Flow Diagram

```
Input (url/index/selector)
         │
         ├─ index/selector ──► Content Script gets URL
         │                          │
         │                          ▼
         │                    On current page?
         │                      ↓yes     ↓no
         │                  Page context  Direct
         │                    fetch      download
         │                      │
         └─ url ───────────────►├──► Blob URL
                                │
                                ▼
                  chrome.downloads.download({
                    url: blobUrl or originalUrl,
                    filename: `${timestamp}.${ext}`
                  })
```

## Architecture

```
MCP Server                    Extension
    │                            │
    │  browser_download          │
    │  {url/index/selector}      │
    ├──────────────────────────► │ Side Panel (WebSocket)
    │                            │      │
    │                            │      ▼
    │                            │ Service Worker
    │                            │      │
    │                            │      ├─► Parse params (URL/selector/index)
    │                            │      │
    │                            │      ├─► Content Script
    │                            │      │   (page context fetch)
    │                            │      │
    │                            │      ▼
    │                            │ chrome.downloads.download()
    │                            │      │
    │  {success, filename}       │      │
    │ ◄─────────────────────────┼──────┘
```

## Implementation Checklist

### 1. Extension Manifest
- [ ] Add `"downloads"` permission to `manifest.json`

### 2. MCP Server (`mcp-server/src/index.ts`)
- [ ] Add `browser_download` tool definition to TOOLS array
- [ ] Add `browser_download: 'download'` to action mapping

### 3. Service Worker (`extension/src/background/index.ts`)
- [ ] Add `download` action handler
- [ ] Implement parameter resolution (url/index/selector)
- [ ] Implement `chrome.downloads.download()` call
- [ ] Handle download completion/error events

### 4. Content Script (`extension/src/content/index.ts`)
- [ ] Add `FETCH_RESOURCE` message handler
- [ ] Implement page context fetch with blob conversion
- [ ] Return base64 data to Service Worker

### 5. Types (`extension/src/types/message.ts`)
- [ ] Add `DownloadResult` interface
- [ ] Add `FETCH_RESOURCE` message type

## Error Handling

| Scenario | Error Message |
|----------|---------------|
| Missing params | `"Provide one of: url, index, or selector"` |
| Selector no match | `"Element not found: {selector}"` |
| Index out of range | `"Element index {index} out of range"` |
| Element has no URL | `"Element has no downloadable resource"` |
| Fetch failed | `"Resource fetch failed: {status}"` |
| Download blocked | `"Download blocked by browser"` |
| Network error | `"Network request failed: {error}"` |

## Timeouts

- Page fetch: 30 seconds
- Download initiation: 10 seconds (only checks if download started, does not wait for completion)

## Usage Example

```
User: "Download the logo on this page"

AI Agent:
1. browser_get_dom_tree
   → [3] img "Logo" @(10,10,200,50)

2. browser_download({ index: 3 })
   → { success: true, filename: "1706284800123.png", downloadId: 42 }

3. Response: "Downloaded logo as 1706284800123.png"
```
