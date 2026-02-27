/**
 * Compact DOM tree builder (Playwright-style format with element indices)
 */

import { elementIndexMap, resetElementIndexMap } from './state';

const INTERACTIVE_TAGS = new Set([
  'a', 'button', 'input', 'textarea', 'select', 'option',
  'details', 'summary', 'dialog', 'menu', 'menuitem',
  'video', 'audio',
]);

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'radio', 'switch', 'tab', 'treeitem', 'checkbox',
  'combobox', 'listbox', 'searchbox', 'slider', 'spinbutton', 'textbox',
  'gridcell', 'row', 'progressbar', 'scrollbar', 'separator', 'tooltip',
]);

const INTERACTIVE_CLASS_KEYWORDS = [
  'btn', 'button', 'click', 'link', 'tab', 'toggle', 'switch',
  'dropdown', 'menu', 'action', 'submit', 'close', 'open',
  'expand', 'collapse', 'play', 'pause', 'like', 'share', 'comment',
  'follow', 'subscribe', 'download', 'upload', 'search', 'nav',
];

const LANDMARK_TAGS = new Set([
  'header', 'nav', 'main', 'aside', 'footer', 'form',
]);

const TEXT_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'label', 'li', 'td', 'th', 'caption', 'figcaption',
]);

const EXCLUDED_TAGS = new Set([
  'script', 'style', 'noscript', 'svg', 'path', 'defs', 'clippath',
  'lineargradient', 'radialgradient', 'stop', 'symbol', 'use',
  'meta', 'link', 'head', 'title',
]);

interface InternalNode {
  element: Element;
  tag: string;
  interactive: boolean;
  isLandmark: boolean;
  isTextTag: boolean;
  text: string;
  depth: number;
  children: InternalNode[];
}

export interface CompactDomTreeOptions {
  selector?: string;
  maxDepth?: number;
  excludeTags?: string[];
}

export function getAccessibleName(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelEl = document.getElementById(ariaLabelledBy);
    if (labelEl) return labelEl.textContent?.trim() || '';
  }

  const alt = el.getAttribute('alt');
  if (alt) return alt.trim();

  const title = el.getAttribute('title');
  if (title) return title.trim();

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder.trim();

  let text = '';
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent?.trim() || '';
    }
  }

  if (!text) {
    text = el.textContent?.trim() || '';
  }

  return text.slice(0, 80);
}

function isInteractive(el: Element): boolean {
  const tag = el.tagName.toLowerCase();

  if (INTERACTIVE_TAGS.has(tag)) return true;

  const role = el.getAttribute('role');
  if (role && INTERACTIVE_ROLES.has(role)) return true;

  if (el.getAttribute('contenteditable') === 'true') return true;
  if ((el as HTMLElement).isContentEditable) return true;

  const tabindex = el.getAttribute('tabindex');
  if (tabindex && parseInt(tabindex) >= 0) return true;

  if (el.hasAttribute('onclick')) return true;

  if (el.hasAttribute('data-action') || el.hasAttribute('data-click')) return true;

  const isGenericContainer = ['div', 'span', 'section', 'article', 'li', 'ul', 'ol'].includes(tag);

  if (isGenericContainer) {
    const hasInteractiveChild = el.querySelector('a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"]');
    if (hasInteractiveChild) {
      return false;
    }
  }

  try {
    const style = window.getComputedStyle(el);
    if (style.cursor === 'pointer') {
      if (isGenericContainer) {
        const ariaLabel = el.getAttribute('aria-label');
        const title = el.getAttribute('title');
        if (ariaLabel || title) {
          return true;
        }
        const hasDirectText = Array.from(el.childNodes).some(
          node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
        );
        const childCount = el.children.length;
        if (hasDirectText && childCount === 0) {
          return true;
        }
      } else {
        const hasText = el.textContent?.trim();
        const hasAriaLabel = el.getAttribute('aria-label');
        const hasTitle = el.getAttribute('title');
        if (hasText || hasAriaLabel || hasTitle) {
          return true;
        }
      }
    }
  } catch {
    // ignore style computation errors
  }

  if (isGenericContainer) {
    return false;
  }

  const className = el.className;
  if (typeof className === 'string' && className) {
    const lowerClassName = className.toLowerCase();
    for (const keyword of INTERACTIVE_CLASS_KEYWORDS) {
      if (lowerClassName.includes(keyword)) {
        return true;
      }
    }
  }

  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const attrName = attrs[i].name.toLowerCase();
    if (attrName.startsWith('data-') &&
        (attrName.includes('click') || attrName.includes('action') ||
         attrName.includes('toggle') || attrName.includes('trigger'))) {
      return true;
    }
  }

  return false;
}

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  return true;
}

function findLandmark(el: Element): string | undefined {
  let current: Element | null = el.parentElement;
  while (current) {
    const tag = current.tagName.toLowerCase();
    if (LANDMARK_TAGS.has(tag)) {
      return tag;
    }
    const role = current.getAttribute('role');
    if (role && ['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'form', 'search', 'region'].includes(role)) {
      return role;
    }
    current = current.parentElement;
  }
  return undefined;
}

export function buildCompactDomTree(options: CompactDomTreeOptions = {}): string {
  const { selector, maxDepth = 15, excludeTags = [] } = options;
  const excludeSet = new Set([...EXCLUDED_TAGS, ...excludeTags.map(t => t.toLowerCase())]);

  resetElementIndexMap();

  const root = selector ? document.querySelector(selector) : document.body;
  if (!root) {
    return `# DOM Tree (0 elements)\n\nNo elements found${selector ? ` for selector: ${selector}` : ''}`;
  }

  const MAX_NODES = 500;
  let nodeCount = 0;

  function getDirectText(el: Element): string {
    let text = '';
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent?.trim();
        if (t) text += t + ' ';
      }
    }
    return text.trim().slice(0, 100);
  }

  function collectNode(el: Element, depth: number, insideInteractive: boolean = false): InternalNode | null {
    if (depth > maxDepth) return null;

    if (nodeCount >= MAX_NODES) {
      return null;
    }

    const tag = el.tagName.toLowerCase();

    if (excludeSet.has(tag)) return null;

    if (el.id === 'agents-cc-overlay') return null;

    if (!isVisible(el)) return null;

    const interactive = isInteractive(el);
    const isLandmark = LANDMARK_TAGS.has(tag);
    const isTextTag = TEXT_TAGS.has(tag);
    const directText = getDirectText(el);

    if (insideInteractive && !interactive && !isLandmark) {
      const children: InternalNode[] = [];

      if (el.shadowRoot) {
        for (const child of el.shadowRoot.children) {
          if (child instanceof Element) {
            const childNode = collectNode(child, depth, true);
            if (childNode) children.push(childNode);
          }
        }
      }

      for (const child of el.children) {
        const childNode = collectNode(child, depth, true);
        if (childNode) children.push(childNode);
      }

      if (children.length > 0) {
        return {
          element: el,
          tag,
          interactive: false,
          isLandmark: false,
          isTextTag: false,
          text: '',
          depth,
          children,
        };
      }
      return null;
    }

    const children: InternalNode[] = [];
    const childInsideInteractive = insideInteractive || interactive;

    if (el.shadowRoot) {
      for (const child of el.shadowRoot.children) {
        if (child instanceof Element) {
          const childNode = collectNode(child, depth + 1, childInsideInteractive);
          if (childNode) children.push(childNode);
        }
      }
    }

    for (const child of el.children) {
      const childNode = collectNode(child, depth + 1, childInsideInteractive);
      if (childNode) children.push(childNode);
    }

    const hasChildren = children.length > 0;
    const needsOutput = interactive || (isTextTag && directText.length > 0) || (isLandmark && hasChildren);

    if (needsOutput) {
      nodeCount++;
      return {
        element: el,
        tag,
        interactive,
        isLandmark,
        isTextTag,
        text: directText,
        depth,
        children,
      };
    } else if (hasChildren) {
      return {
        element: el,
        tag,
        interactive: false,
        isLandmark: false,
        isTextTag: false,
        text: '',
        depth,
        children,
      };
    }

    return null;
  }

  function formatNode(node: InternalNode, nodeIndex: number, outputDepth: number): string {
    const { element: el, tag, interactive, isLandmark, text } = node;
    const indent = '  '.repeat(outputDepth);
    const parts: string[] = [];

    parts.push(`[${nodeIndex}]`);
    parts.push(tag);

    const role = el.getAttribute('role');
    if (role && role !== tag) {
      parts.push(`[role=${role}]`);
    }

    if (tag === 'input') {
      const type = el.getAttribute('type') || 'text';
      parts.push(`[type=${type}]`);
    }

    if (!isLandmark) {
      const displayText = interactive ? getAccessibleName(el) : text;
      if (displayText) {
        parts.push(`"${displayText.replace(/"/g, '\\"').slice(0, 60)}"`);
      }
    }

    if (tag === 'input' || tag === 'textarea') {
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) parts.push(`placeholder="${placeholder.slice(0, 30)}"`);
    }

    if (tag === 'input') {
      const type = el.getAttribute('type') || 'text';
      const inputEl = el as HTMLInputElement;
      if (!['password', 'hidden'].includes(type) && inputEl.value) {
        parts.push(`value="${inputEl.value.slice(0, 30)}"`);
      }
    }

    if (tag === 'textarea') {
      const textareaEl = el as HTMLTextAreaElement;
      if (textareaEl.value) {
        parts.push(`value="${textareaEl.value.slice(0, 50)}"`);
      }
    }

    if (tag === 'select') {
      const selectEl = el as HTMLSelectElement;
      const selectedOption = selectEl.options[selectEl.selectedIndex];
      if (selectedOption) {
        parts.push(`selected="${selectedOption.text.slice(0, 20)}"`);
      }
      const selectOptions = Array.from(selectEl.options).slice(0, 5).map(o => o.text.slice(0, 15));
      if (selectOptions.length > 0) {
        parts.push(`options=[${selectOptions.join('|')}]`);
      }
    }

    if (['input', 'select', 'textarea'].includes(tag)) {
      const name = el.getAttribute('name');
      if (name) parts.push(`name="${name}"`);
    }

    if (tag === 'a') {
      const href = el.getAttribute('href');
      if (href) {
        try {
          const url = new URL(href, window.location.origin);
          const shortHref = url.origin === window.location.origin
            ? url.pathname + url.search
            : href.slice(0, 50);
          parts.push(`→ ${shortHref}`);
        } catch {
          parts.push(`→ ${href.slice(0, 50)}`);
        }
      }
    }

    if (tag === 'video' || tag === 'audio') {
      const src = el.getAttribute('src');
      if (src) {
        const shortSrc = src.length > 30 ? '...' + src.slice(-27) : src;
        parts.push(`src="${shortSrc}"`);
      }
      if (tag === 'video') {
        const videoEl = el as HTMLVideoElement;
        if (videoEl.duration && !isNaN(videoEl.duration)) {
          const mins = Math.floor(videoEl.duration / 60);
          const secs = Math.floor(videoEl.duration % 60);
          parts.push(`duration=${mins}:${secs.toString().padStart(2, '0')}`);
        }
        if (videoEl.paused) parts.push('[paused]');
      }
    }

    if (tag === 'img') {
      const alt = el.getAttribute('alt');
      if (alt) parts.push(`alt="${alt.slice(0, 30)}"`);
      const src = el.getAttribute('src');
      if (src) {
        const shortSrc = src.length > 40 ? src.slice(0, 37) + '...' : src;
        parts.push(`src="${shortSrc}"`);
      }
    }

    const stateAttrs: string[] = [];
    if (el.hasAttribute('disabled')) stateAttrs.push('disabled');
    if (el.hasAttribute('readonly')) stateAttrs.push('readonly');
    if (el.hasAttribute('required')) stateAttrs.push('required');
    if (tag === 'input') {
      const type = el.getAttribute('type');
      if ((type === 'checkbox' || type === 'radio') && (el as HTMLInputElement).checked) {
        stateAttrs.push('checked');
      }
    }
    const expanded = el.getAttribute('aria-expanded');
    if (expanded === 'true') stateAttrs.push('expanded');
    if (expanded === 'false') stateAttrs.push('collapsed');
    const selected = el.getAttribute('aria-selected');
    if (selected === 'true') stateAttrs.push('selected');

    if (stateAttrs.length > 0) {
      parts.push(`[${stateAttrs.join(',')}]`);
    }

    const rect = el.getBoundingClientRect();
    parts.push(`@(${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)})`);

    return `${indent}${parts.join(' ')}`;
  }

  function generateOutput(node: InternalNode, outputDepth: number): { lines: string[]; index: number; interactiveCount: number; textCount: number } {
    let index = 0;
    let interactiveCount = 0;
    let textCount = 0;
    const lines: string[] = [];

    function traverse(n: InternalNode, depth: number): void {
      const needsIndex = n.interactive || n.isLandmark || n.isTextTag;

      if (needsIndex) {
        const currentIndex = index++;

        elementIndexMap.set(currentIndex, n.element);

        (n.element as HTMLElement).dataset.agentIndex = String(currentIndex);

        if (n.interactive) interactiveCount++;
        if (n.isTextTag) textCount++;

        lines.push(formatNode(n, currentIndex, depth));

        for (const child of n.children) {
          traverse(child, depth + 1);
        }
      } else {
        for (const child of n.children) {
          traverse(child, depth);
        }
      }
    }

    traverse(node, outputDepth);
    return { lines, index, interactiveCount, textCount };
  }

  const rootNode = collectNode(root, 0);

  if (!rootNode) {
    return `# DOM Tree (0 elements)\n\nNo interactive elements found${selector ? ` in selector: ${selector}` : ''}`;
  }

  const result = generateOutput(rootNode, 0);

  const header = [
    `# DOM Tree`,
    `# ${result.index} elements, ${result.interactiveCount} interactive, ${result.textCount} text`,
  ].join('\n');

  return header + '\n\n' + result.lines.join('\n');
}
