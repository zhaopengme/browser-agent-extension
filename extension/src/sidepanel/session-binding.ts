export type TabInfo = {
  id: number;
  url?: string;
};

export function isScriptableUrl(url?: string): boolean {
  if (!url) {
    return false;
  }
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'chromewebstore.google.com') {
    return false;
  }
  if (host === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) {
    return false;
  }
  return true;
}

export function pickTabIdForNewSession(activeTab?: TabInfo | null): number | null {
  if (!activeTab) {
    return null;
  }
  if (!isScriptableUrl(activeTab.url)) {
    return null;
  }
  return activeTab.id;
}
