/**
 * Side Panel - WebSocket Client + UI
 * 连接 MCP Server，转发请求到 Service Worker
 */

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3026;
const RECONNECT_DELAY = 3000;
const MAX_RETRIES = 1;
const STORAGE_KEY = 'browserAgentSettings';

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
  return `ws://${settings.host}:${settings.port}`;
}

interface WSRequest {
  type: 'REQUEST';
  id: string;
  sessionId?: string; // NEW: Session identifier for multi-client support
  action: string;
  params?: Record<string, unknown>;
}

interface WSResponse {
  type: 'RESPONSE';
  id: string;
  sessionId?: string; // NEW: Echo back session identifier
  payload: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

interface SessionBinding {
  sessionId: string;
  tabId: number;
  createdAt: number;
  lastActiveAt: number;
}

interface SessionStartMessage {
  type: 'SESSION_START';
  sessionId: string;
}

interface SessionEndMessage {
  type: 'SESSION_END';
  sessionId: string;
}

// DOM 元素 - 工具栏
const statusDot = document.getElementById('statusDot') as HTMLDivElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;
const btnReconnect = document.getElementById('btnReconnect') as HTMLButtonElement;
const btnDisconnect = document.getElementById('btnDisconnect') as HTMLButtonElement;

// DOM 元素 - 会话列表
const sessionsList = document.getElementById('sessionsList') as HTMLDivElement;

// DOM 元素 - 日志
const logContainer = document.getElementById('logContainer') as HTMLDivElement;
const btnClear = document.getElementById('btnClear') as HTMLButtonElement;

// DOM 元素 - 标签切换
const tabs = document.querySelectorAll('.tab-icon') as NodeListOf<HTMLButtonElement>;
const panels = document.querySelectorAll('.panel') as NodeListOf<HTMLDivElement>;

// DOM 元素 - 设置
const inputHost = document.getElementById('inputHost') as HTMLInputElement;
const inputPort = document.getElementById('inputPort') as HTMLInputElement;
const versionText = document.getElementById('versionText') as HTMLSpanElement;

let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let retryCount = 0;

// Session-to-tab bindings for multi-client support
const sessionBindings = new Map<string, SessionBinding>();

/**
 * 格式化时间差为人类可读格式
 */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * 获取标签页信息
 */
async function getTabInfo(tabId: number): Promise<{ title: string; url: string }> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url || '';
    const hostname = url ? new URL(url).hostname : '';
    return {
      title: tab.title || 'Loading...',
      url: hostname || url || 'about:blank'
    };
  } catch (error) {
    console.error('[SidePanel] Failed to get tab info:', error);
    return {
      title: 'Tab closed',
      url: ''
    };
  }
}

/**
 * 渲染会话列表
 */
async function renderSessionsList(): Promise<void> {
  if (sessionBindings.size === 0) {
    sessionsList.innerHTML = '<div class="empty-sessions">No active sessions</div>';
    return;
  }

  sessionsList.innerHTML = '';

  for (const [sessionId, binding] of sessionBindings.entries()) {
    const tabInfo = await getTabInfo(binding.tabId);
    const timeAgo = formatTimeAgo(binding.lastActiveAt);
    const shortSessionId = sessionId.slice(0, 12);

    // 检查标签页是否仍然存在
    let isConnected = false;
    try {
      await chrome.tabs.get(binding.tabId);
      isConnected = true;
    } catch {
      isConnected = false;
    }

    const sessionItem = document.createElement('div');
    sessionItem.className = 'session-item';
    sessionItem.dataset.sessionId = sessionId;
    sessionItem.dataset.tabId = String(binding.tabId);

    sessionItem.innerHTML = `
      <div class="session-header">
        <span class="session-status ${isConnected ? 'connected' : 'disconnected'}"></span>
        <span class="session-id">${shortSessionId}</span>
        <span class="session-time">${timeAgo}</span>
      </div>
      <div class="session-tab">
        <span class="tab-title">${tabInfo.url || tabInfo.title}</span>
      </div>
      <div class="session-actions">
        <button class="focus-tab-btn">Focus</button>
        <button class="close-tab-btn">Close</button>
      </div>
    `;

    // 点击会话项聚焦标签页
    sessionItem.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName !== 'BUTTON') {
        focusTab(binding.tabId);
      }
    });

    // Focus 按钮
    const focusBtn = sessionItem.querySelector('.focus-tab-btn') as HTMLButtonElement;
    focusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      focusTab(binding.tabId);
    });

    // Close 按钮
    const closeBtn = sessionItem.querySelector('.close-tab-btn') as HTMLButtonElement;
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSessionTab(sessionId, binding.tabId);
    });

    sessionsList.appendChild(sessionItem);
  }
}

/**
 * 聚焦标签页
 */
async function focusTab(tabId: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    addLog('tab', `Focused tab ${tabId}`, 'success');
  } catch (error) {
    console.error('[SidePanel] Failed to focus tab:', error);
    addLog('tab', `Failed to focus tab ${tabId}`, 'error');
  }
}

/**
 * 关闭会话标签页
 */
async function closeSessionTab(sessionId: string, tabId: number): Promise<void> {
  try {
    await chrome.tabs.remove(tabId);
    await cleanupSession(sessionId, false); // 不再次关闭标签页
    sendSessionEnd(sessionId);
    await renderSessionsList();
    addLog('session', `Closed session ${sessionId.slice(0, 8)}`, 'success');
  } catch (error) {
    console.error('[SidePanel] Failed to close session tab:', error);
    addLog('session', `Failed to close session ${sessionId.slice(0, 8)}`, 'error');
  }
}

/**
 * 切换标签页
 */
function switchTab(targetPanel: string): void {
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.panel === targetPanel);
  });

  panels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel${targetPanel.charAt(0).toUpperCase() + targetPanel.slice(1)}`);
  });
}

/**
 * 获取或创建会话对应的标签页
 */
async function getOrCreateTabForSession(sessionId: string): Promise<number> {
  let binding = sessionBindings.get(sessionId);

  if (!binding) {
    // 为此会话创建新标签页
    const tab = await chrome.tabs.create({ active: false });
    if (!tab.id) {
      throw new Error('Failed to create tab for session');
    }

    binding = {
      sessionId,
      tabId: tab.id,
      createdAt: Date.now(),
      lastActiveAt: Date.now()
    };
    sessionBindings.set(sessionId, binding);

    addLog('session', `Session ${sessionId.slice(0, 8)} bound to tab ${tab.id}`, 'success');

    // 通知服务器会话已启动
    sendSessionStart(sessionId);

    // 更新会话列表 UI
    await renderSessionsList();
  } else {
    // 更新最后活跃时间
    binding.lastActiveAt = Date.now();

    // 验证标签页是否仍然存在
    try {
      await chrome.tabs.get(binding.tabId);
    } catch {
      // 标签页已关闭，创建新的
      const tab = await chrome.tabs.create({ active: false });
      if (!tab.id) {
        throw new Error('Failed to recreate tab for session');
      }
      binding.tabId = tab.id;
      addLog('session', `Session ${sessionId.slice(0, 8)} rebound to new tab ${tab.id}`, 'success');
    }

    // 更新会话列表 UI
    await renderSessionsList();
  }

  return binding.tabId;
}

/**
 * 发送会话启动消息到服务器
 */
function sendSessionStart(sessionId: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const message: SessionStartMessage = {
      type: 'SESSION_START',
      sessionId
    };
    ws.send(JSON.stringify(message));
  }
}

/**
 * 发送会话结束消息到服务器
 */
function sendSessionEnd(sessionId: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const message: SessionEndMessage = {
      type: 'SESSION_END',
      sessionId
    };
    ws.send(JSON.stringify(message));
  }
}

/**
 * 清理会话绑定
 */
async function cleanupSession(sessionId: string, closeTab: boolean = false): Promise<void> {
  const binding = sessionBindings.get(sessionId);
  if (binding) {
    if (closeTab) {
      try {
        await chrome.tabs.remove(binding.tabId);
        addLog('session', `Closed tab ${binding.tabId} for session ${sessionId.slice(0, 8)}`, 'success');
      } catch (error) {
        console.error('[SidePanel] Failed to close tab:', error);
      }
    }
    sessionBindings.delete(sessionId);
    addLog('session', `Session ${sessionId.slice(0, 8)} cleaned up`, 'success');

    // 更新会话列表 UI
    await renderSessionsList();
  }
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
  logContainer.scrollTop = logContainer.scrollHeight;
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
 * 连接 WebSocket
 */
function connect(): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
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
      retryCount = 0;
      updateStatus('connected');
      addLog('system', 'Connected to MCP Server', 'success');
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        // 处理 SESSION_END 消息
        if (message.type === 'SESSION_END') {
          const sessionId = message.sessionId;
          if (sessionId) {
            addLog('session', `Received SESSION_END for ${sessionId.slice(0, 8)}`, 'pending');
            await cleanupSession(sessionId, true); // 关闭标签页
          }
          return;
        }

        // 处理 REQUEST 消息
        if (message.type === 'REQUEST') {
          const request = message as WSRequest;
          const sessionId = request.sessionId;

          addLog(request.action, JSON.stringify(request.params || {}).slice(0, 100));

          let tabId: number | undefined;

          // 如果有 sessionId，获取或创建对应的标签页
          if (sessionId) {
            try {
              tabId = await getOrCreateTabForSession(sessionId);
            } catch (error) {
              console.error('[SidePanel] Failed to get/create tab for session:', error);
              const errorResponse: WSResponse = {
                type: 'RESPONSE',
                id: request.id,
                sessionId: sessionId,
                payload: {
                  success: false,
                  error: `Failed to get/create tab for session: ${error instanceof Error ? error.message : 'Unknown error'}`
                }
              };
              ws?.send(JSON.stringify(errorResponse));
              addLog(request.action, 'session tab error', 'error');
              return;
            }
          }

          // 转发请求到 Service Worker
          const response = await chrome.runtime.sendMessage({
            type: 'MCP_REQUEST',
            id: request.id,
            action: request.action,
            params: request.params,
            tabId: tabId, // 传递 tabId 以便在特定标签页执行操作
          });

          // 发送响应回 MCP Server，回显 sessionId
          const wsResponse: WSResponse = {
            type: 'RESPONSE',
            id: request.id,
            sessionId: sessionId, // Echo back sessionId
            payload: response,
          };

          ws?.send(JSON.stringify(wsResponse));

          if (response.success) {
            addLog(request.action, 'completed', 'success');
          } else {
            addLog(request.action, response.error || 'failed', 'error');
          }
        }
      } catch (error) {
        console.error('[SidePanel] Message handling error:', error);
        addLog('error', String(error), 'error');
      }
    };

    ws.onclose = () => {
      console.log('[SidePanel] WebSocket disconnected');
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

  retryCount++;

  if (retryCount >= MAX_RETRIES) {
    console.log('[SidePanel] Max retries reached, stopping auto-reconnect');
    addLog('system', `Connection failed after ${MAX_RETRIES} attempts`, 'error');
    return;
  }

  addLog('system', `Reconnecting in ${RECONNECT_DELAY / 1000}s... (${retryCount}/${MAX_RETRIES})`, 'pending');

  reconnectTimer = window.setTimeout(() => {
    console.log('[SidePanel] Attempting to reconnect...');
    connect();
  }, RECONNECT_DELAY);
}

/**
 * 手动重连
 */
function manualReconnect(): void {
  retryCount = 0;
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
  retryCount = MAX_RETRIES; // 阻止自动重连

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
  logContainer.innerHTML = '<div class="empty-log">Waiting for tasks...</div>';
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

// 监听标签页更新（标题、URL 变化）
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.title || changeInfo.url) {
    // 检查是否是会话绑定的标签页
    for (const binding of sessionBindings.values()) {
      if (binding.tabId === tabId) {
        renderSessionsList();
        break;
      }
    }
  }
});

// 监听标签页关闭
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // 查找并清理对应的会话
  for (const [sessionId, binding] of sessionBindings.entries()) {
    if (binding.tabId === tabId) {
      await cleanupSession(sessionId, false);
      sendSessionEnd(sessionId);
      break;
    }
  }
});

// 定期更新 "time ago" 显示
setInterval(() => {
  if (sessionBindings.size > 0) {
    renderSessionsList();
  }
}, 5000);

console.log('[SidePanel] Side Panel loaded');
