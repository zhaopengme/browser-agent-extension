import { expect, test } from 'bun:test';
import { isScriptableUrl, pickTabIdForNewSession } from '../src/sidepanel/session-binding';

test('prefers active http tab for new session', () => {
  const tabId = pickTabIdForNewSession({ id: 7, url: 'https://x.com/ivanfioravanti/status/2014676267325432266' });
  expect(tabId).toBe(7);
});

test('rejects non-scriptable urls', () => {
  expect(isScriptableUrl('chrome://extensions')).toBe(false);
  expect(isScriptableUrl('https://chrome.google.com/webstore/detail/foo')).toBe(false);
});
