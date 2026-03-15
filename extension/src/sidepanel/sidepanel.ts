/**
 * Side Panel - WebSocket Client + UI
 * 连接 MCP Server，转发请求到 Service Worker
 */

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3026;
const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;
const STORAGE_KEY = 'browserAgentSettings';
const MAX_LOG_ENTRIES = 200;

interface Settings {
  host: string;
  port: number;
}

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // ignore
  }
  return { host: DEFAULT_HOST, port: DEFAULT_PORT };
}

function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function getWsUrl(): string {
  const settings = loadSettings();
  return `ws://${settings.host}:${settings.port}/ws`;
}

interface WSRequest {
  type: 'REQUEST';
  id: string;
  payload: {
    action: string;
    params?: Record<string, unknown>;
  };
}

interface WSResponse {
  type: 'RESPONSE';
  id: string;
  payload: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

// DOM 元素 - 工具栏
const statusDot = document.getElementById('statusDot') as HTMLDivElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;
const btnReconnect = document.getElementById('btnReconnect') as HTMLButtonElement;
const btnDisconnect = document.getElementById('btnDisconnect') as HTMLButtonElement;

// DOM 元素 - 日志
const logContainer = document.getElementById('logContainer') as HTMLDivElement;
const btnClear = document.getElementById('btnClear') as HTMLButtonElement;
const logCount = document.getElementById('logCount') as HTMLSpanElement;

// DOM 元素 - 标签切换
const tabs = document.querySelectorAll('.tab') as NodeListOf<HTMLButtonElement>;
const panels = document.querySelectorAll('.panel') as NodeListOf<HTMLDivElement>;

// DOM 元素 - 设置
const inputHost = document.getElementById('inputHost') as HTMLInputElement;
const inputPort = document.getElementById('inputPort') as HTMLInputElement;
const versionText = document.getElementById('versionText') as HTMLSpanElement;

let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let logEntryCount = 0;

/**
 * 切换标签页
 */
function switchTab(targetPanel: string): void {
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.panel === targetPanel);
  });

  panels.forEach(panel => {
    const panelId = `panel${targetPanel.charAt(0).toUpperCase() + targetPanel.slice(1)}`;
    panel.classList.toggle('active', panel.id === panelId);
  });
}

/**
 * 更新日志计数
 */
function updateLogCount(): void {
  logCount.textContent = String(logEntryCount);
}

/**
 * 添加日志
 */
function addLog(action: string, detail: string, status: 'pending' | 'success' | 'error' = 'pending'): void {
  // 移除空日志提示
  const emptyLog = logContainer.querySelector('.empty-log');
  if (emptyLog) {
    emptyLog.remove();
  }

  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const entry = document.createElement('div');
  entry.className = 'log-entry';

  const statusClass = status === 'success' ? 'log-success' : status === 'error' ? 'log-error' : '';

  entry.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-action">${action}</span>
    <span class="log-detail ${statusClass}">${detail}</span>
  `;

  logContainer.appendChild(entry);

  // Trim old entries if exceeding limit
  while (logContainer.children.length > MAX_LOG_ENTRIES) {
    logContainer.removeChild(logContainer.firstChild!);
  }

  logContainer.scrollTop = logContainer.scrollHeight;

  // 更新计数
  logEntryCount++;
  updateLogCount();
}

/**
 * 更新连接状态
 */
function updateStatus(status: 'connected' | 'connecting' | 'disconnected'): void {
  statusDot.classList.remove('connected', 'connecting');
  statusText.classList.remove('connected', 'disconnected');

  switch (status) {
    case 'connected':
      statusDot.classList.add('connected');
      statusText.classList.add('connected');
      statusText.textContent = 'Connected';
      btnReconnect.style.display = 'none';
      btnDisconnect.style.display = 'inline-block';
      setSettingsEnabled(false);
      break;
    case 'connecting':
      statusDot.classList.add('connecting');
      statusText.textContent = 'Connecting...';
      btnReconnect.disabled = true;
      btnDisconnect.style.display = 'none';
      setSettingsEnabled(false);
      break;
    case 'disconnected':
      statusText.classList.add('disconnected');
      statusText.textContent = 'Disconnected';
      btnReconnect.style.display = 'inline-block';
      btnReconnect.disabled = false;
      btnDisconnect.style.display = 'none';
      setSettingsEnabled(true);
      break;
  }
}

/**
 * 设置输入框启用/禁用状态
 */
function setSettingsEnabled(enabled: boolean): void {
  inputHost.disabled = !enabled;
  inputPort.disabled = !enabled;

  if (enabled) {
    inputHost.style.opacity = '1';
    inputPort.style.opacity = '1';
  } else {
    inputHost.style.opacity = '0.5';
    inputPort.style.opacity = '0.5';
  }
}

/**
 * 安全发送 WebSocket 消息，防止在连接关闭时发送失败
 */
function safeSend(message: object): boolean {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  console.warn('[SidePanel] Cannot send: WebSocket not open');
  return false;
}

/**
 * 连接 WebSocket
 */
function connect(): void {
  // 如果已有连接或正在连接中，不要创建重复连接
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  // 保存当前设置
  const host = inputHost.value.trim() || DEFAULT_HOST;
  const port = parseInt(inputPort.value, 10) || DEFAULT_PORT;
  saveSettings({ host, port });

  updateStatus('connecting');

  const wsUrl = getWsUrl();
  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[SidePanel] WebSocket connected');
      reconnectAttempts = 0; // Reset retry counter on successful connection
      updateStatus('connected');
      addLog('system', 'Connected to MCP Server', 'success');

      // Send HELLO message to complete handshake
      const helloMessage = { type: 'HELLO', version: chrome.runtime.getManifest().version };
      safeSend(helloMessage);
      console.log('[SidePanel] Handshake message sent');
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        // 处理 REQUEST 消息
        if (message.type === 'REQUEST') {
          const request = message as WSRequest;
          const { action, params } = request.payload;

          addLog(action, JSON.stringify(params || {}).slice(0, 100));

          let tabId: number | undefined;

          // 始终使用当前活动标签
          try {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            tabId = activeTab?.id;

            // 检查当前标签页是否是受限URL (chrome://, chrome-extension://等)
            const restrictedPrefixes = ['chrome://', 'chrome-extension://', 'devtools://', 'edge://', 'about:'];
            const isRestrictedUrl = activeTab?.url && restrictedPrefixes.some(prefix => activeTab.url!.startsWith(prefix));

            if (!tabId || isRestrictedUrl) {
              // 没有活动标签或是受限页面时，创建一个新标签
              console.log('[SidePanel] Creating new tab (no active tab or restricted URL)');
              try {
                const tab = await chrome.tabs.create({ active: true });
                if (!tab.id) {
                  throw new Error('Failed to create tab - no tab ID returned');
                }
                tabId = tab.id;
                // 等待新标签页加载完成
                await new Promise(resolve => setTimeout(resolve, 500));
              } catch (createError) {
                throw new Error(`Failed to create new tab: ${createError instanceof Error ? createError.message : 'Unknown error'}`);
              }
            }
          } catch (error) {
            console.error('[SidePanel] Failed to get active tab:', error);
            const errorResponse: WSResponse = {
              type: 'RESPONSE',
              id: request.id,
              payload: {
                success: false,
                error: `Failed to get active tab: ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            };
            safeSend(errorResponse);
            addLog(action, 'no active tab', 'error');
            return;
          }

          // 转发请求到 Service Worker
          const response = await chrome.runtime.sendMessage({
            type: 'MCP_REQUEST',
            id: request.id,
            action: action,
            params: params || {},
            tabId: tabId,
          });

          // 发送响应回 MCP Server
          const wsResponse: WSResponse = {
            type: 'RESPONSE',
            id: request.id,
            payload: response,
          };

          safeSend(wsResponse);

          if (response.success) {
            addLog(action, 'completed', 'success');
          } else {
            addLog(action, response.error || 'failed', 'error');
          }
        }
      } catch (error) {
        console.error('[SidePanel] Message handling error:', error);
        addLog('error', String(error), 'error');
      }
    };

    ws.onclose = () => {
      console.log('[SidePanel] WebSocket disconnected');
      ws = null;
      updateStatus('disconnected');
      addLog('system', 'Disconnected from MCP Server', 'error');
      scheduleReconnect();
    };

    ws.onerror = () => {
      // 静默处理，onclose 会处理断开逻辑
    };
  } catch (error) {
    console.error('[SidePanel] Failed to connect:', error);
    updateStatus('disconnected');
    scheduleReconnect();
  }
}

/**
 * 安排重连
 */
function scheduleReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // 检查是否超过最大重试次数
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    addLog('system', 'Max reconnect attempts reached, stopped', 'error');
    return;
  }

  reconnectAttempts++;
  addLog('system', `Reconnecting in ${RECONNECT_DELAY / 1000}s... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'pending');

  reconnectTimer = window.setTimeout(() => {
    console.log('[SidePanel] Attempting to reconnect...');
    connect();
  }, RECONNECT_DELAY);
}

/**
 * 手动重连
 */
function manualReconnect(): void {
  reconnectAttempts = 0; // Reset retry counter on manual reconnect
  btnReconnect.disabled = true;
  addLog('system', 'Manual reconnect...', 'pending');
  connect();
}

/**
 * 断开连接
 */
function disconnect(): void {
  // 取消自动重连
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (ws) {
    ws.close();
    ws = null;
  }

  updateStatus('disconnected');
  addLog('system', 'Manually disconnected', 'success');
}

/**
 * 清空日志
 */
function clearLogs(): void {
  logContainer.innerHTML = '<div class="empty-log"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg><div>Waiting for tasks...</div></div>';
  logEntryCount = 0;
  updateLogCount();
}

/**
 * 初始化设置输入框
 */
function initSettings(): void {
  const settings = loadSettings();
  inputHost.value = settings.host;
  inputPort.value = String(settings.port);
}

// 事件监听 - 标签切换
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetPanel = tab.dataset.panel;
    if (targetPanel) {
      switchTab(targetPanel);
    }
  });
});

// 事件监听 - 日志
btnClear.addEventListener('click', clearLogs);
btnReconnect.addEventListener('click', manualReconnect);
btnDisconnect.addEventListener('click', disconnect);

// 显示版本号
versionText.textContent = chrome.runtime.getManifest().version;

// 初始化设置
initSettings();

// 初始化连接
connect();

console.log('[SidePanel] Side Panel loaded');

// 定期打印内存统计（每5分钟）
setInterval(() => {
  console.log('[MemoryStats] WebSocket state:', ws?.readyState, 'Reconnect attempts:', reconnectAttempts, 'Log entries:', logEntryCount);
}, 300000);
