/**
 * ExtensionTransport - CDP 传输层
 * 封装 chrome.debugger API，提供 CDP 命令发送能力
 */

type EventCallback = (method: string, params?: Record<string, unknown>) => void;

export class ExtensionTransport {
  private tabId: number;
  private attached: boolean = false;
  private eventListeners: Set<EventCallback> = new Set();
  private readonly CDP_COMMAND_TIMEOUT = 30000;

  constructor(tabId: number) {
    this.tabId = tabId;
  }

  /**
   * 连接到标签页的调试器
   */
  async attach(): Promise<void> {
    if (this.attached) return;

    await chrome.debugger.attach({ tabId: this.tabId }, '1.3');
    this.attached = true;

    // 监听 CDP 事件
    chrome.debugger.onEvent.addListener(this.handleEvent);
    chrome.debugger.onDetach.addListener(this.handleDetach);
  }

  /**
   * 断开调试器连接
   */
  async detach(): Promise<void> {
    if (!this.attached) return;

    chrome.debugger.onEvent.removeListener(this.handleEvent);
    chrome.debugger.onDetach.removeListener(this.handleDetach);

    try {
      await chrome.debugger.detach({ tabId: this.tabId });
    } catch (e) {
      // 可能已经断开
    }
    this.attached = false;
  }

  /**
   * 发送 CDP 命令（带自动重连）
   */
  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    // 如果未连接，尝试重新连接
    if (!this.attached) {
      try {
        await this.attach();
        console.log(`[Transport] Re-attached to tab ${this.tabId}`);
      } catch (error) {
        throw new Error(`Failed to re-attach: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const commandPromise = chrome.debugger.sendCommand(
      { tabId: this.tabId },
      method,
      params
    );

    let timeoutId = 0;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`CDP command timeout: ${method} (${this.CDP_COMMAND_TIMEOUT}ms)`)),
        this.CDP_COMMAND_TIMEOUT
      );
    });

    try {
      const result = await Promise.race([commandPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result as T;
    } catch (error) {
      clearTimeout(timeoutId);
      // 检查是否是连接相关的错误
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('detached') || errorMessage.includes('closed')) {
        this.attached = false;
        throw new Error(`CDP connection lost: ${errorMessage}`);
      }
      throw error;
    }
  }

  /**
   * 检查是否已连接
   */
  isAttached(): boolean {
    return this.attached;
  }

  /**
   * 获取标签页 ID
   */
  getTabId(): number {
    return this.tabId;
  }

  /**
   * 添加事件监听器
   */
  on(callback: EventCallback): void {
    this.eventListeners.add(callback);
  }

  /**
   * 移除事件监听器
   */
  off(callback: EventCallback): void {
    this.eventListeners.delete(callback);
  }

  /**
   * 处理 CDP 事件
   */
  private handleEvent = (
    source: chrome.debugger.Debuggee,
    method: string,
    params?: object
  ): void => {
    if (source.tabId !== this.tabId) return;

    for (const callback of this.eventListeners) {
      callback(method, params as Record<string, unknown>);
    }
  };

  /**
   * 处理调试器断开
   */
  private handleDetach = (
    source: chrome.debugger.Debuggee,
    reason: string
  ): void => {
    if (source.tabId !== this.tabId) return;
    this.attached = false;
    console.log(`Debugger detached from tab ${this.tabId}: ${reason}`);
  };
}
