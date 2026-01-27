# Browser Agent MCP Server

MCP Server for controlling browser through the Browser Agent Extension.

## Setup

1. Install dependencies and build:
```bash
cd mcp-server
bun install
bun run build
# or compile a single binary:
bun run build:bin
```

2. Add to Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "browser-agent": {
      "command": "C:/07.dev/browser-agent-extension/mcp-server/dist/browser-agent-mcp"
    }
  }
}
```

Or use the JS entrypoint:
```json
{
  "mcpServers": {
    "browser-agent": {
      "command": "bun",
      "args": ["C:/07.dev/browser-agent-extension/mcp-server/dist/main.js"]
    }
  }
}
```

3. Open the browser extension side panel to establish WebSocket connection.

4. Restart Claude Desktop.

## Available Tools

- `browser_navigate` - Navigate to a URL
- `browser_click` - Click on an element or coordinates
- `browser_type` - Type text into an element
- `browser_scroll` - Scroll the page
- `browser_screenshot` - Take a screenshot
- `browser_extract` - Extract content from an element
- `browser_evaluate` - Execute JavaScript
- `browser_get_page_info` - Get current page info
- `browser_get_tabs` - List all open tabs
- `browser_switch_tab` - Switch to a specific tab
- `browser_press_key` - Press a keyboard key
- `browser_select_option` - Select dropdown option
- `browser_go_back` - Navigate back
- `browser_go_forward` - Navigate forward
- `browser_reload` - Reload page
