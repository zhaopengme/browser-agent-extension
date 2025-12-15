/**
 * BrowserContext - 浏览器上下文管理
 * 管理多个标签页的 Page 实例
 */

import { Page } from './page';

export class BrowserContext {
  private pages: Map<number, Page> = new Map();

  /**
   * 获取当前活动标签页
   */
  async getActivePage(): Promise<Page> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      throw new Error('No active tab found');
    }

    return this.getOrCreatePage(tab.id);
  }

  /**
   * 获取指定标签页
   */
  async getPage(tabId: number): Promise<Page> {
    return this.getOrCreatePage(tabId);
  }

  /**
   * 获取所有标签页
   */
  async getAllPages(): Promise<Page[]> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return Promise.all(
      tabs
        .filter(tab => tab.id !== undefined)
        .map(tab => this.getOrCreatePage(tab.id!))
    );
  }

  /**
   * 获取所有标签页信息
   */
  async getAllTabsInfo(): Promise<Array<{ id: number; url: string; title: string; active: boolean }>> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs
      .filter(tab => tab.id !== undefined)
      .map(tab => ({
        id: tab.id!,
        url: tab.url || '',
        title: tab.title || '',
        active: tab.active || false,
      }));
  }

  /**
   * 切换到指定标签页
   */
  async switchToTab(tabId: number): Promise<void> {
    await chrome.tabs.update(tabId, { active: true });
  }

  /**
   * 通过 URL 切换标签页
   */
  async switchToTabByUrl(url: string): Promise<number | null> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tab = tabs.find(t => t.url?.includes(url));

    if (tab && tab.id) {
      await chrome.tabs.update(tab.id, { active: true });
      return tab.id;
    }

    return null;
  }

  /**
   * 创建新标签页
   */
  async createTab(url?: string): Promise<Page> {
    const tab = await chrome.tabs.create({ url, active: true });

    if (!tab.id) {
      throw new Error('Failed to create tab');
    }

    // 等待标签页加载
    await this.waitForTabLoad(tab.id);

    return this.getOrCreatePage(tab.id);
  }

  /**
   * 关闭标签页
   */
  async closeTab(tabId: number): Promise<void> {
    const page = this.pages.get(tabId);
    if (page) {
      await page.close();
      this.pages.delete(tabId);
    }
    await chrome.tabs.remove(tabId);
  }

  /**
   * 关闭所有连接
   */
  async closeAll(): Promise<void> {
    for (const page of this.pages.values()) {
      await page.close();
    }
    this.pages.clear();
  }

  /**
   * 移除已关闭的标签页
   */
  removeClosedTab(tabId: number): void {
    this.pages.delete(tabId);
  }

  /**
   * 获取或创建 Page 实例
   */
  private async getOrCreatePage(tabId: number): Promise<Page> {
    let page = this.pages.get(tabId);

    if (page) {
      // 检查现有连接是否仍然有效
      if (!page.isConnected()) {
        // 连接已断开，需要重新初始化
        console.log(`[BrowserContext] Reconnecting to tab ${tabId}...`);
        await page.ensureConnected();
      }
    } else {
      // 创建新的 Page 实例
      page = new Page(tabId);
      await page.initialize();
      this.pages.set(tabId, page);
    }

    return page;
  }

  /**
   * 等待标签页加载完成
   */
  private waitForTabLoad(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo
      ) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      // 超时保护
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 10000);
    });
  }
}

// 导出单例
export const browserContext = new BrowserContext();
