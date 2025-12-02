/**
 * Side Panel - WebSocket Client + UI + Settings
 * 连接 MCP Server，转发请求到 Service Worker，管理 AI 配置
 */

import type { AIConfig, AIProvider } from '@/types/ai';
import { DEFAULT_MODELS } from '@/types/ai';

const WS_URL = 'ws://127.0.0.1:3026';
const RECONNECT_DELAY = 3000;
const MAX_RETRIES = 1;
const STORAGE_KEY = 'ai_config';

interface WSRequest {
  type: 'REQUEST';
  id: string;
  action: string;
  params?: Record<string, unknown>;
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

// DOM 元素 - 日志
const logContainer = document.getElementById('logContainer') as HTMLDivElement;
const btnClear = document.getElementById('btnClear') as HTMLButtonElement;

// DOM 元素 - 标签切换
const tabs = document.querySelectorAll('.tab-icon') as NodeListOf<HTMLButtonElement>;
const panels = document.querySelectorAll('.panel') as NodeListOf<HTMLDivElement>;

// DOM 元素 - Settings 表单
const providerSelect = document.getElementById('provider') as HTMLSelectElement;
const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const modelInput = document.getElementById('model') as HTMLInputElement;
const modelHint = document.getElementById('modelHint') as HTMLDivElement;
const baseURLInput = document.getElementById('baseURL') as HTMLInputElement;
const btnSave = document.getElementById('btnSave') as HTMLButtonElement;
const saveStatus = document.getElementById('saveStatus') as HTMLDivElement;

let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let retryCount = 0;

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

  switch (status) {
    case 'connected':
      statusDot.classList.add('connected');
      statusText.textContent = 'Connected';
      btnReconnect.style.display = 'none';
      break;
    case 'connecting':
      statusDot.classList.add('connecting');
      statusText.textContent = 'Connecting...';
      btnReconnect.disabled = true;
      break;
    case 'disconnected':
      statusText.textContent = 'Disconnected';
      btnReconnect.style.display = 'inline-block';
      btnReconnect.disabled = false;
      break;
  }
}

/**
 * 连接 WebSocket
 */
function connect(): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return;
  }

  updateStatus('connecting');

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[SidePanel] WebSocket connected');
      retryCount = 0;
      updateStatus('connected');
      addLog('system', 'Connected to MCP Server', 'success');
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data) as WSRequest;

        if (message.type === 'REQUEST') {
          addLog(message.action, JSON.stringify(message.params || {}).slice(0, 100));

          // 转发请求到 Service Worker
          const response = await chrome.runtime.sendMessage({
            type: 'MCP_REQUEST',
            id: message.id,
            action: message.action,
            params: message.params,
          });

          // 发送响应回 MCP Server
          const wsResponse: WSResponse = {
            type: 'RESPONSE',
            id: message.id,
            payload: response,
          };

          ws?.send(JSON.stringify(wsResponse));

          if (response.success) {
            addLog(message.action, 'completed', 'success');
          } else {
            addLog(message.action, response.error || 'failed', 'error');
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
 * 清空日志
 */
function clearLogs(): void {
  logContainer.innerHTML = '<div class="empty-log">Waiting for tasks...</div>';
}

/**
 * 更新模型提示
 */
function updateModelHint(): void {
  const provider = providerSelect.value as AIProvider;
  if (provider && DEFAULT_MODELS[provider]) {
    modelHint.textContent = `Default: ${DEFAULT_MODELS[provider]}`;
  } else {
    modelHint.textContent = 'Select a provider first';
  }
}

/**
 * 加载已保存的配置
 */
async function loadConfig(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const config = result[STORAGE_KEY] as AIConfig | undefined;

    if (config) {
      providerSelect.value = config.provider || '';
      apiKeyInput.value = config.apiKey || '';
      modelInput.value = config.model || '';
      baseURLInput.value = config.baseURL || '';
      updateModelHint();
    }
  } catch (error) {
    console.error('[SidePanel] Failed to load config:', error);
  }
}

/**
 * 保存配置
 */
async function saveConfig(): Promise<void> {
  const provider = providerSelect.value as AIProvider;
  const apiKey = apiKeyInput.value.trim();

  if (!provider) {
    showSaveStatus('Please select a provider', 'error');
    return;
  }

  if (!apiKey) {
    showSaveStatus('Please enter an API key', 'error');
    return;
  }

  const config: AIConfig = {
    provider,
    apiKey,
    model: modelInput.value.trim() || undefined,
    baseURL: baseURLInput.value.trim() || undefined,
  };

  try {
    btnSave.disabled = true;
    await chrome.storage.local.set({ [STORAGE_KEY]: config });
    showSaveStatus('Configuration saved!', 'success');
  } catch (error) {
    console.error('[SidePanel] Failed to save config:', error);
    showSaveStatus('Failed to save', 'error');
  } finally {
    btnSave.disabled = false;
  }
}

/**
 * 显示保存状态
 */
function showSaveStatus(message: string, type: 'success' | 'error'): void {
  saveStatus.textContent = message;
  saveStatus.className = `save-status ${type}`;

  setTimeout(() => {
    saveStatus.textContent = '';
    saveStatus.className = 'save-status';
  }, 3000);
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

// 事件监听 - Settings
providerSelect.addEventListener('change', updateModelHint);
btnSave.addEventListener('click', saveConfig);

// 初始化
loadConfig();
connect();

console.log('[SidePanel] Side Panel loaded');
