/**
 * Content Script entry point
 * Pure message router - delegates to functional modules
 */

import type { ContentMessage } from '@/types/message';
import { showOverlay, hideOverlay, updateOverlayStatus, getOverlayState } from './overlay';
import { buildCompactDomTree } from './dom-tree-compact';
import { buildDomTree } from './dom-tree-full';
import { clickElementByIndex, typeInElementByIndex, blurElement, typeInFocusedElement } from './interaction';
import { getElementInfo, extractElements, scrollToElement, highlightElement } from './element-utils';
import { executeScript } from './execute';
import { getResourceUrlByIndex, fetchResourceInPageContext } from './resource';
import { convertToMarkdown } from './markdown';
import { createAnnotations, removeAnnotations } from './annotate';

chrome.runtime.onMessage.addListener(
  (message: ContentMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'PING':
        sendResponse({ success: true, data: 'pong' });
        return true;

      case 'GET_MARKDOWN':
        convertToMarkdown(message.payload?.selector).then(result => {
          sendResponse(result);
        }).catch(error => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to convert to markdown',
          });
        });
        return true;

      case 'GET_DOM_TREE':
        sendResponse({
          success: true,
          data: buildCompactDomTree({
            selector: message.payload?.selector,
            maxDepth: message.payload?.maxDepth,
            excludeTags: message.payload?.excludeTags,
          }),
        });
        return true;

      case 'GET_DOM_TREE_FULL':
        sendResponse({
          success: true,
          data: buildDomTree({ selector: message.payload?.selector }),
        });
        return true;

      case 'GET_DOM_TREE_STRUCTURED':
        sendResponse({ success: true, data: buildDomTree({
          selector: message.payload?.selector,
          maxDepth: message.payload?.maxDepth,
        }) });
        return true;

      case 'GET_DOM_TREE_ARIA':
        sendResponse({
          success: true,
          data: buildCompactDomTree({
            selector: message.payload?.selector,
            maxDepth: message.payload?.maxDepth,
          }),
        });
        return true;

      case 'CLICK_BY_INDEX':
        if (message.payload?.index === undefined) {
          sendResponse({ success: false, error: 'index is required' });
        } else {
          clickElementByIndex(message.payload.index, message.payload.humanLike !== false).then(sendResponse);
        }
        return true;

      case 'TYPE_BY_INDEX':
        if (message.payload?.index === undefined || message.payload?.text === undefined) {
          sendResponse({ success: false, error: 'index and text are required' });
        } else {
          sendResponse(typeInElementByIndex(
            message.payload.index,
            message.payload.text,
            message.payload.clearFirst
          ));
        }
        return true;

      case 'TYPE_IN_FOCUSED':
        if (message.payload?.text === undefined) {
          sendResponse({ success: false, error: 'text is required' });
        } else {
          sendResponse(typeInFocusedElement(
            message.payload.text,
            message.payload.clearFirst
          ));
        }
        return true;

      case 'BLUR_ELEMENT':
        sendResponse(blurElement(
          message.payload?.index,
          message.payload?.selector
        ));
        return true;

      case 'GET_ELEMENT_INFO':
        if (!message.payload?.selector) {
          sendResponse({ success: false, error: 'selector is required' });
        } else {
          sendResponse(getElementInfo(message.payload.selector));
        }
        return true;

      case 'EXTRACT_ELEMENTS':
        if (!message.payload?.selector) {
          sendResponse({ success: false, error: 'selector is required' });
        } else {
          sendResponse(extractElements(
            message.payload.selector,
            message.payload.multiple,
            message.payload.attributes
          ));
        }
        return true;

      case 'SCROLL_TO_ELEMENT':
        if (!message.payload?.selector) {
          sendResponse({ success: false, error: 'selector is required' });
        } else {
          sendResponse(scrollToElement(message.payload.selector));
        }
        return true;

      case 'HIGHLIGHT_ELEMENT':
        if (!message.payload?.selector) {
          sendResponse({ success: false, error: 'selector is required' });
        } else {
          sendResponse(highlightElement(message.payload.selector));
        }
        return true;

      case 'EXECUTE_SCRIPT':
        if (!message.payload?.script) {
          sendResponse({ success: false, error: 'script is required' });
        } else {
          sendResponse(executeScript(message.payload.script));
        }
        return true;

      case 'SHOW_OVERLAY':
        sendResponse(showOverlay(message.payload?.status));
        return true;

      case 'HIDE_OVERLAY':
        sendResponse(hideOverlay());
        return true;

      case 'UPDATE_OVERLAY_STATUS':
        if (!message.payload?.status) {
          sendResponse({ success: false, error: 'status is required' });
        } else {
          sendResponse(updateOverlayStatus(
            message.payload.status,
            message.payload.shimmer
          ));
        }
        return true;

      case 'GET_OVERLAY_STATE':
        sendResponse(getOverlayState());
        return true;

      case 'GET_RESOURCE_URL_BY_INDEX':
        if (message.payload?.index === undefined) {
          sendResponse({ success: false, error: 'index is required' });
          return true;
        }
        sendResponse(getResourceUrlByIndex(message.payload.index));
        return true;

      case 'FETCH_RESOURCE':
        if (!message.payload?.url) {
          sendResponse({ success: false, error: 'url is required' });
          return true;
        }
        fetchResourceInPageContext(message.payload.url).then(result => {
          sendResponse(result);
        }).catch(error => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch resource'
          });
        });
        return true;

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

      default:
        return false;
    }
  }
);

console.log('[Browser Agent] Content Script loaded');
