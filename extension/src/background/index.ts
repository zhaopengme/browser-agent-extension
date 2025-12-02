/**
 * Service Worker
 * 接收 Side Panel 消息，执行 CDP 操作和 AI 调用
 */

import { browserContext } from '@/cdp';
import { aiService, saveAIConfig, getAIConfig, clearAIConfig } from '@/ai';
import type { AIConfig, ChatMessage } from '@/types/ai';

interface MCPRequest {
  type: 'MCP_REQUEST';
  id: string;
  action: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * 初始化扩展
 */
async function initialize(): Promise<void> {
  console.log('[Background] Browser Agent Extension initializing...');

  // 点击扩展图标时打开 Side Panel
  chrome.action.onClicked.addListener((tab) => {
    if (tab.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId });
    }
  });

  // 监听来自 Side Panel 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'MCP_REQUEST') {
      handleMCPRequest(message as MCPRequest)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      return true; // 保持消息通道打开
    }
  });

  // 监听标签页关闭
  chrome.tabs.onRemoved.addListener((tabId) => {
    browserContext.removeClosedTab(tabId);
  });

  console.log('[Background] Extension initialized');
}

/**
 * 处理 MCP 请求
 */
async function handleMCPRequest(request: MCPRequest): Promise<MCPResponse> {
  const { action, params } = request;
  console.log(`[Background] MCP Request: ${action}`, params);

  try {
    const result = await executeAction(action, params || {});
    return { success: true, data: result };
  } catch (error) {
    console.error(`[Background] Action error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 执行操作
 */
async function executeAction(action: string, params: Record<string, unknown>): Promise<unknown> {
  // 锁定/解锁操作不需要获取 page
  switch (action) {
    case 'lock': {
      const status = (params.status as string) || 'Agent is controlling this page';
      await showOverlay(status);
      return { locked: true, status };
    }

    case 'unlock': {
      await hideOverlay();
      return { unlocked: true };
    }

    case 'update_status': {
      const status = params.status as string;
      if (!status) throw new Error('status is required');
      await updateOverlayStatus(status, params.shimmer as boolean);
      return { updated: true, status };
    }
  }

  const page = await browserContext.getActivePage();

  switch (action) {
    case 'navigate': {
      const url = params.url as string;
      if (!url) throw new Error('URL is required');
      await page.navigateTo(url);
      await page.waitForNavigation().catch(() => {});
      const info = await page.getPageInfo();
      return { url: info.url, title: info.title };
    }

    case 'click': {
      if (params.selector) {
        const result = await page.clickElement(params.selector as string);
        return { clicked: true, element: result };
      } else if (params.x !== undefined && params.y !== undefined) {
        await page.clickAt(params.x as number, params.y as number, {
          button: params.button as 'left' | 'right' | 'middle',
          clickCount: params.clickCount as number,
        });
        return { clicked: true };
      }
      throw new Error('selector or coordinates required');
    }

    case 'type': {
      const text = params.text as string;
      if (!text) throw new Error('text is required');

      if (params.selector) {
        await page.typeInElement(params.selector as string, text, {
          clearFirst: params.clearFirst as boolean,
          delay: params.delay as number,
        });
      } else {
        await page.type(text, params.delay as number);
      }
      return { typed: true, length: text.length };
    }

    case 'scroll': {
      if (params.selector) {
        await page.scrollToElement(params.selector as string);
        return { scrolled: true };
      } else if (params.x !== undefined && params.y !== undefined) {
        await page.scrollTo(params.x as number, params.y as number);
        return { scrolled: true };
      } else {
        const direction = (params.direction as string) || 'down';
        const distance = (params.distance as number) || 500;
        const pos = await page.scroll(direction as 'up' | 'down' | 'left' | 'right', distance);
        return { scrollX: pos.x, scrollY: pos.y };
      }
    }

    case 'screenshot': {
      const format = (params.format as string) || 'png';
      const quality = params.quality as number;
      const fullPage = params.fullPage as boolean;

      const image = await page.captureScreenshot({
        format: format as 'png' | 'jpeg' | 'webp',
        quality,
        captureBeyondViewport: fullPage,
      });

      const viewport = await page.getViewportSize();
      return { image, width: viewport.width, height: viewport.height };
    }

    case 'extract': {
      const selector = params.selector as string;
      if (!selector) throw new Error('selector is required');

      const result = await page.evaluate<{ text: string; html: string }>(`
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) throw new Error('Element not found');
          return {
            text: el.textContent?.trim() || '',
            html: el.outerHTML
          };
        })()
      `);
      return result;
    }

    case 'evaluate': {
      const script = params.script as string;
      if (!script) throw new Error('script is required');
      const result = await page.evaluate(script);
      return { result };
    }

    case 'get_page_info': {
      const info = await page.getPageInfo();
      return info;
    }

    case 'get_tabs': {
      const tabs = await browserContext.getAllTabsInfo();
      return { tabs };
    }

    case 'switch_tab': {
      const tabId = params.tabId as number;
      if (!tabId) throw new Error('tabId is required');
      await browserContext.switchToTab(tabId);
      return { switched: true };
    }

    case 'press_key': {
      const key = params.key as string;
      if (!key) throw new Error('key is required');
      await page.pressKey(key);
      return { pressed: true, key };
    }

    case 'select_option': {
      const selector = params.selector as string;
      if (!selector) throw new Error('selector is required');
      const result = await page.selectOption(selector, {
        value: params.value as string,
        text: params.text as string,
        index: params.index as number,
      });
      return { selected: true, ...result };
    }

    case 'go_back': {
      await page.goBack();
      return { navigated: true };
    }

    case 'go_forward': {
      await page.goForward();
      return { navigated: true };
    }

    case 'reload': {
      await page.reload();
      return { reloaded: true };
    }

    // ========== 网络请求捕获 ==========

    case 'enable_network': {
      await page.enableNetworkCapture();
      return { enabled: true };
    }

    case 'disable_network': {
      await page.disableNetworkCapture();
      return { disabled: true };
    }

    case 'get_network_requests': {
      const requests = page.getNetworkRequests({
        urlPattern: params.urlPattern as string | undefined,
        method: params.method as string | undefined,
        statusCode: params.statusCode as number | undefined,
        resourceType: params.resourceType as string | undefined,
        clear: params.clear as boolean | undefined,
      });
      return { requests, count: requests.length };
    }

    case 'clear_network_requests': {
      page.clearNetworkRequests();
      return { cleared: true };
    }

    case 'wait_for_response': {
      const urlPattern = params.urlPattern as string;
      if (!urlPattern) throw new Error('urlPattern is required');

      const response = await page.waitForResponse(urlPattern, {
        method: params.method as string | undefined,
        timeout: params.timeout as number | undefined,
      });

      if (response) {
        return { found: true, request: response };
      }
      return { found: false, timedOut: true };
    }

    // ========== 等待机制 ==========

    case 'wait_for_selector': {
      const selector = params.selector as string;
      if (!selector) throw new Error('selector is required');

      const found = await page.waitForSelector(selector, {
        visible: params.visible as boolean | undefined,
        hidden: params.hidden as boolean | undefined,
        timeout: params.timeout as number | undefined,
      });

      return { found, selector };
    }

    case 'wait_for_timeout': {
      const ms = params.ms as number;
      if (!ms) throw new Error('ms is required');

      await page.waitForTimeout(ms);
      return { waited: true, ms };
    }

    case 'wait_for_load_state': {
      const state = (params.state as string) || 'load';
      const validStates = ['load', 'domcontentloaded', 'networkidle'];
      if (!validStates.includes(state)) {
        throw new Error(`Invalid state: ${state}. Must be one of: ${validStates.join(', ')}`);
      }

      const success = await page.waitForLoadState(
        state as 'load' | 'domcontentloaded' | 'networkidle',
        { timeout: params.timeout as number | undefined }
      );

      return { success, state };
    }

    case 'wait_for_function': {
      const fn = params.function as string;
      if (!fn) throw new Error('function is required');

      const success = await page.waitForFunction(fn, {
        timeout: params.timeout as number | undefined,
        polling: params.polling as number | undefined,
      });

      return { success };
    }

    // ========== 文件上传 ==========

    case 'upload_file': {
      const selector = params.selector as string;
      const files = params.files as string[];
      if (!selector) throw new Error('selector is required');
      if (!files || !Array.isArray(files)) throw new Error('files array is required');

      await page.setInputFiles(selector, files);
      return { uploaded: true, files: files.length };
    }

    // ========== 弹窗处理 ==========

    case 'get_dialog': {
      const dialog = page.getDialog();
      if (dialog) {
        return { hasDialog: true, dialog };
      }
      return { hasDialog: false };
    }

    case 'handle_dialog': {
      const accept = params.accept as boolean ?? true;
      const promptText = params.promptText as string | undefined;

      const handled = await page.handleDialog(accept, promptText);
      return { handled, accept };
    }

    case 'set_auto_dialog': {
      const handler = params.handler as 'accept' | 'dismiss' | null;
      page.setAutoDialogHandler(handler);
      return { set: true, handler };
    }

    // ========== 控制台日志 ==========

    case 'get_console_logs': {
      const logs = await page.getConsoleLogs();

      // 可选过滤
      const types = params.types as string[] | undefined;
      let filteredLogs = logs;
      if (types && types.length > 0) {
        filteredLogs = logs.filter(log => types.includes(log.type));
      }

      return { logs: filteredLogs, count: filteredLogs.length };
    }

    case 'enable_console_capture': {
      await page.enableConsoleCapture();
      return { enabled: true };
    }

    // ========== 高级鼠标操作 ==========

    case 'hover': {
      const selector = params.selector as string;
      if (!selector) throw new Error('selector is required');

      await page.hover(selector);
      return { hovered: true, selector };
    }

    case 'double_click': {
      const selector = params.selector as string;
      if (!selector) throw new Error('selector is required');

      await page.doubleClick(selector);
      return { doubleClicked: true, selector };
    }

    case 'right_click': {
      const selector = params.selector as string;
      if (!selector) throw new Error('selector is required');

      await page.rightClick(selector);
      return { rightClicked: true, selector };
    }

    // ========== AI 相关操作 ==========

    case 'ai_config': {
      const config = params as Partial<AIConfig>;
      if (!config.provider || !config.apiKey) {
        throw new Error('provider and apiKey are required');
      }
      const fullConfig: AIConfig = {
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        baseURL: config.baseURL,
      };
      await saveAIConfig(fullConfig);
      aiService.setConfig(fullConfig);
      return { configured: true, provider: config.provider };
    }

    case 'ai_get_config': {
      const config = await getAIConfig();
      if (!config) {
        return { configured: false };
      }
      // 不返回完整的 apiKey，只返回部分信息
      return {
        configured: true,
        provider: config.provider,
        model: config.model,
        hasApiKey: !!config.apiKey,
      };
    }

    case 'ai_clear_config': {
      await clearAIConfig();
      return { cleared: true };
    }

    case 'ai_chat': {
      const prompt = params.prompt as string;
      const systemPrompt = params.systemPrompt as string | undefined;
      if (!prompt) throw new Error('prompt is required');

      // 确保服务已初始化
      if (!aiService.isReady()) {
        await aiService.initialize();
      }
      if (!aiService.isReady()) {
        throw new Error('AI service not configured. Use ai_config first.');
      }

      const response = await aiService.chat(prompt, systemPrompt);
      return { response };
    }

    case 'ai_generate': {
      const messages = params.messages as ChatMessage[];
      if (!messages || !Array.isArray(messages)) {
        throw new Error('messages array is required');
      }

      // 确保服务已初始化
      if (!aiService.isReady()) {
        await aiService.initialize();
      }
      if (!aiService.isReady()) {
        throw new Error('AI service not configured. Use ai_config first.');
      }

      const result = await aiService.generateText({
        messages,
        temperature: params.temperature as number | undefined,
        maxTokens: params.maxTokens as number | undefined,
      });

      return {
        content: result.content,
        model: result.model,
        usage: result.usage,
        finishReason: result.finishReason,
      };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * 显示操作遮罩层
 */
async function showOverlay(status: string): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_OVERLAY',
        payload: { status },
      });
    }
  } catch {
    // 忽略错误
  }
}

/**
 * 隐藏操作遮罩层
 */
async function hideOverlay(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'HIDE_OVERLAY' });
    }
  } catch {
    // 忽略错误
  }
}

/**
 * 更新遮罩层状态文本
 */
async function updateOverlayStatus(status: string, shimmer?: boolean): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'UPDATE_OVERLAY_STATUS',
        payload: { status, shimmer },
      });
    }
  } catch {
    // 忽略错误
  }
}

// 启动初始化
initialize().catch(console.error);
