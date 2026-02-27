/**
 * Agent control overlay layer
 */

import type { ContentResponse } from '@/types/message';
import { overlayState } from './state';

function createOverlayStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.id = 'agents-cc-overlay-styles';
  style.textContent = `
    @keyframes agents-cc-border-pulse {
      0%, 100% {
        box-shadow: inset 0 0 0 4px rgba(59, 130, 246, 0.8),
                    inset 0 0 30px rgba(59, 130, 246, 0.3),
                    0 0 20px rgba(59, 130, 246, 0.4);
      }
      50% {
        box-shadow: inset 0 0 0 4px rgba(59, 130, 246, 1),
                    inset 0 0 50px rgba(59, 130, 246, 0.5),
                    0 0 40px rgba(59, 130, 246, 0.6);
      }
    }

    @keyframes agents-cc-dot-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }

    @keyframes agents-cc-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    #agents-cc-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 2147483646;
      pointer-events: auto;
      animation: agents-cc-border-pulse 2s ease-in-out infinite;
      transition: opacity 0.3s ease;
    }

    #agents-cc-overlay.agents-cc-hidden {
      opacity: 0;
      pointer-events: none;
    }

    #agents-cc-overlay-blocker {
      position: absolute;
      top: 4px;
      left: 4px;
      right: 4px;
      bottom: 4px;
      background: transparent;
      cursor: not-allowed;
    }

    #agents-cc-status-bar {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 10px;
      background: linear-gradient(135deg, rgba(30, 58, 138, 0.95), rgba(59, 130, 246, 0.9));
      backdrop-filter: blur(10px);
      padding: 10px 20px;
      border-radius: 50px;
      box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4),
                  0 0 0 1px rgba(255, 255, 255, 0.1);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #agents-cc-status-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #agents-cc-status-icon svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    #agents-cc-status-dot {
      width: 8px;
      height: 8px;
      background: #4ade80;
      border-radius: 50%;
      animation: agents-cc-dot-pulse 1.5s ease-in-out infinite;
      box-shadow: 0 0 10px #4ade80;
    }

    #agents-cc-status-text {
      color: white;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.3px;
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      background: linear-gradient(90deg, white 40%, rgba(255,255,255,0.6) 50%, white 60%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      background-clip: text;
    }

    #agents-cc-status-text.agents-cc-shimmer {
      animation: agents-cc-shimmer 2s linear infinite;
      -webkit-text-fill-color: transparent;
    }

    #agents-cc-corner-indicator {
      position: absolute;
      bottom: 20px;
      right: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(30, 58, 138, 0.9);
      backdrop-filter: blur(10px);
      padding: 8px 14px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }

    #agents-cc-corner-indicator span {
      color: rgba(255, 255, 255, 0.9);
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
  `;
  return style;
}

function createOverlayElement(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = 'agents-cc-overlay';
  overlay.className = 'agents-cc-hidden';

  overlay.innerHTML = `
    <div id="agents-cc-overlay-blocker"></div>
    <div id="agents-cc-status-bar">
      <div id="agents-cc-status-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
      <div id="agents-cc-status-dot"></div>
      <span id="agents-cc-status-text">Agent is controlling this page</span>
    </div>
    <div id="agents-cc-corner-indicator">
      <div id="agents-cc-status-dot" style="width:6px;height:6px;"></div>
      <span>Agents CC Active</span>
    </div>
  `;

  const blocker = overlay.querySelector('#agents-cc-overlay-blocker') as HTMLDivElement;

  const blockEvent = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  };

  ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel'].forEach(event => {
    blocker.addEventListener(event, blockEvent, true);
  });

  const keyBlocker = (e: KeyboardEvent) => {
    if (overlayState.enabled) {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    }
  };

  document.addEventListener('keydown', keyBlocker, true);
  document.addEventListener('keyup', keyBlocker, true);
  document.addEventListener('keypress', keyBlocker, true);

  return overlay;
}

function initOverlay(): void {
  if (document.getElementById('agents-cc-overlay')) {
    return;
  }

  const existingStyle = document.getElementById('agents-cc-overlay-styles');
  if (!existingStyle) {
    document.head.appendChild(createOverlayStyles());
  }

  overlayState.element = createOverlayElement();
  document.body.appendChild(overlayState.element);
}

export function showOverlay(status?: string): ContentResponse<boolean> {
  try {
    initOverlay();

    if (overlayState.element) {
      overlayState.element.classList.remove('agents-cc-hidden');
      overlayState.enabled = true;

      if (status) {
        updateOverlayStatus(status);
      }
    }

    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to show overlay',
    };
  }
}

export function hideOverlay(): ContentResponse<boolean> {
  try {
    if (overlayState.element) {
      overlayState.element.classList.add('agents-cc-hidden');
      overlayState.enabled = false;
    }

    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to hide overlay',
    };
  }
}

export function updateOverlayStatus(status: string, shimmer: boolean = false): ContentResponse<boolean> {
  try {
    initOverlay();

    const statusText = document.getElementById('agents-cc-status-text');
    if (statusText) {
      statusText.textContent = status;
      overlayState.status = status;

      if (shimmer) {
        statusText.classList.add('agents-cc-shimmer');
      } else {
        statusText.classList.remove('agents-cc-shimmer');
      }
    }

    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update status',
    };
  }
}

export function getOverlayState(): ContentResponse<{ enabled: boolean; status: string }> {
  return {
    success: true,
    data: {
      enabled: overlayState.enabled,
      status: overlayState.status,
    },
  };
}
