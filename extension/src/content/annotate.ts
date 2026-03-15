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
