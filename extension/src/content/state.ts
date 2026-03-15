/**
 * Shared state for content script modules
 */

export interface OverlayState {
  enabled: boolean;
  status: string;
  element: HTMLDivElement | null;
}

export const overlayState: OverlayState = {
  enabled: false,
  status: '',
  element: null,
};

// Element index to DOM element mapping (for click/type operations)
// Reset on each buildCompactDomTree call
export let elementIndexMap: Map<number, Element> = new Map();

export function resetElementIndexMap(): void {
  elementIndexMap = new Map();
}

export function getElementByIndex(index: number): Element | undefined {
  const elementByAttr = document.querySelector(`[data-agent-index="${index}"]`);
  if (elementByAttr) {
    return elementByAttr;
  }
  return elementIndexMap.get(index);
}
