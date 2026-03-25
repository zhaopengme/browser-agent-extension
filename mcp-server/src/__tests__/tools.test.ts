import { describe, it, expect } from 'bun:test';
import { getActionFromToolName } from '../mcp/tools/index.js';

// All tool names registered in server.ts
const ALL_TOOL_NAMES = [
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_scroll',
  'browser_press_key',
  'browser_go_back',
  'browser_go_forward',
  'browser_reload',
  'browser_screenshot',
  'browser_extract',
  'browser_evaluate',
  'browser_get_page_info',
  'browser_get_dom_tree',
  'browser_get_dom_tree_full',
  'browser_get_dom_tree_structured',
  'browser_get_dom_tree_aria',
  'browser_markdown',
  'browser_get_connection_status',
  'browser_get_tabs',
  'browser_switch_tab',
  'browser_blur',
  'browser_select_option',
  'browser_enable_network',
  'browser_disable_network',
  'browser_get_network_requests',
  'browser_get_network_requests_with_response',
  'browser_clear_network_requests',
  'browser_wait_for_response',
  'browser_wait_for_selector',
  'browser_wait_for_timeout',
  'browser_wait_for_load_state',
  'browser_wait_for_function',
  'browser_upload_file',
  'browser_get_dialog',
  'browser_handle_dialog',
  'browser_set_auto_dialog',
  'browser_get_console_logs',
  'browser_enable_console_capture',
  'browser_hover',
  'browser_double_click',
  'browser_right_click',
  'browser_download',
  'browser_get_cookies',
  'browser_set_cookie',
  'browser_delete_cookies',
  'browser_lock',
  'browser_unlock',
  'browser_update_status',
];

describe('Tool name to action mapping', () => {
  it('should have a mapping for every registered tool', () => {
    for (const toolName of ALL_TOOL_NAMES) {
      const action = getActionFromToolName(toolName);
      // Should return a non-empty string (either mapped or fallback)
      expect(action).toBeTruthy();
      expect(typeof action).toBe('string');
    }
  });

  it('should map browser_navigate to navigate', () => {
    expect(getActionFromToolName('browser_navigate')).toBe('navigate');
  });

  it('should map browser_click to click', () => {
    expect(getActionFromToolName('browser_click')).toBe('click');
  });

  it('should map browser_type to type', () => {
    expect(getActionFromToolName('browser_type')).toBe('type');
  });

  it('should map browser_get_dom_tree to get_dom_tree', () => {
    expect(getActionFromToolName('browser_get_dom_tree')).toBe('get_dom_tree');
  });

  it('should map browser_get_dom_tree_structured to get_dom_tree_structured', () => {
    expect(getActionFromToolName('browser_get_dom_tree_structured')).toBe('get_dom_tree_structured');
  });

  it('should map browser_get_dom_tree_aria to get_dom_tree_aria', () => {
    expect(getActionFromToolName('browser_get_dom_tree_aria')).toBe('get_dom_tree_aria');
  });

  it('should map browser_lock to lock', () => {
    expect(getActionFromToolName('browser_lock')).toBe('lock');
  });

  it('should map browser_unlock to unlock', () => {
    expect(getActionFromToolName('browser_unlock')).toBe('unlock');
  });

  it('should map browser_update_status to update_status', () => {
    expect(getActionFromToolName('browser_update_status')).toBe('update_status');
  });

  it('should map browser_screenshot to screenshot', () => {
    expect(getActionFromToolName('browser_screenshot')).toBe('screenshot');
  });

  it('should map browser_markdown to markdown', () => {
    expect(getActionFromToolName('browser_markdown')).toBe('markdown');
  });

  it('should map browser_get_cookies to get_cookies', () => {
    expect(getActionFromToolName('browser_get_cookies')).toBe('get_cookies');
  });

  it('should map browser_set_cookie to set_cookie', () => {
    expect(getActionFromToolName('browser_set_cookie')).toBe('set_cookie');
  });

  it('should map browser_delete_cookies to delete_cookies', () => {
    expect(getActionFromToolName('browser_delete_cookies')).toBe('delete_cookies');
  });

  it('should return tool name as fallback for unknown tools', () => {
    expect(getActionFromToolName('unknown_tool')).toBe('unknown_tool');
  });

  it('all tool names should produce non-empty actions', () => {
    const actions = ALL_TOOL_NAMES.map(name => getActionFromToolName(name));
    const emptyActions = actions.filter(a => !a);
    expect(emptyActions).toHaveLength(0);
  });
});
