/**
 * Full DOM tree builder (JSON format)
 */

export interface DOMTreeNode {
  index: number;
  tagName: string;
  id?: string;
  className?: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  attributes: Record<string, string>;
  children?: DOMTreeNode[];
}

function getImportantAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  const important = ['href', 'src', 'alt', 'title', 'placeholder', 'type', 'name', 'value', 'role', 'aria-label'];

  for (const attr of important) {
    const value = element.getAttribute(attr);
    if (value) {
      attrs[attr] = value;
    }
  }

  return attrs;
}

export interface DomTreeOptions {
  selector?: string;
  maxDepth?: number;
}

export function buildDomTree(options: DomTreeOptions = {}): DOMTreeNode[] {
  const maxDepth = options.maxDepth ?? Infinity;
  let index = 0;

  function processNode(node: Element, depth: number = 0): DOMTreeNode | null {
    if (depth > maxDepth) return null;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return null;
    }

    const rect = node.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      return null;
    }

    const currentIndex = index++;
    const children: DOMTreeNode[] = [];

    if (node.shadowRoot) {
      for (const child of node.shadowRoot.children) {
        if (child instanceof Element) {
          const childNode = processNode(child, depth + 1);
          if (childNode) {
            children.push(childNode);
          }
        }
      }
    }

    for (const child of node.children) {
      const childNode = processNode(child, depth + 1);
      if (childNode) {
        children.push(childNode);
      }
    }

    let text = '';
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent?.trim() || '';
      }
    }

    return {
      index: currentIndex,
      tagName: node.tagName.toLowerCase(),
      id: node.id || undefined,
      className: node.className || undefined,
      text: text.slice(0, 200),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      attributes: getImportantAttributes(node),
      children: children.length > 0 ? children : undefined,
    };
  }

  const result: DOMTreeNode[] = [];
  const rootEl = options.selector
    ? document.querySelector(options.selector)
    : document.body;

  if (!rootEl) return result;

  const root = processNode(rootEl);
  if (root) {
    result.push(root);
  }

  return result;
}
