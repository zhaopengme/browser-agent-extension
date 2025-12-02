# 架构设计文档

## 概述

本项目采用 **MCP (Model Context Protocol) + Side Panel + WebSocket** 架构，实现 AI Agent 对浏览器的自动化控制。

## 整体架构

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    AI 客户端 (Claude Desktop / Cursor / 其他)               │
│                              MCP Client                                     │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ stdio (JSON-RPC 2.0)
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           Go MCP Server                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  MCP Tools: browser_navigate, browser_click, browser_type, ...       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                           WebSocket Server (:3026)                          │
└──────────────────────────────────────┬─────────────────────────────────────┘
                                       │ WebSocket
                                       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          Chrome Extension                                   │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Side Panel                                                            │ │
│  │  - WebSocket Client (连接 MCP Server)                                  │ │
│  │  - 任务日志 UI / 连接状态显示                                          │ │
│  └───────────────────────────┬───────────────────────────────────────────┘ │
│                              │ chrome.runtime.sendMessage                   │
│  ┌───────────────────────────▼───────────────────────────────────────────┐ │
│  │  Service Worker                                                        │ │
│  │  - BrowserContext (多标签页管理)                                       │ │
│  │  - Page (单页操作) / ExtensionTransport (CDP 传输层)                   │ │
│  └───────────────────────────┬───────────────────────────────────────────┘ │
│                              │ chrome.debugger                              │
│  ┌───────────────────────────▼───────────────────────────────────────────┐ │
│  │  Content Script                                                        │ │
│  │  - DOM 操作辅助 / 遮罩层显示 / 日志收集                                │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                              Chrome DevTools Protocol (CDP)
                                       │
                                       ▼
                                 Chrome Browser
```

---

## 核心组件

### 1. Go MCP Server

**职责：**
- 实现 MCP 协议，提供标准化的工具接口
- 通过 stdio 与 AI 客户端通信 (JSON-RPC 2.0)
- 通过 WebSocket 与浏览器扩展通信
- 请求转发和响应路由

**通信协议：**

| 接口 | 协议 | 说明 |
|------|------|------|
| AI 客户端 | stdio (JSON-RPC 2.0) | MCP 标准协议 |
| Chrome 扩展 | WebSocket (:3026) | 自定义消息协议 |

### 2. Chrome Extension - Side Panel

**职责：**
- 维持 WebSocket 连接（仅在打开时）
- 显示任务执行状态和日志
- 转发请求到 Service Worker
- 提供用户界面

**生命周期：**

| 状态 | Side Panel | WebSocket |
|------|-----------|-----------|
| 用户打开 | 运行 | 连接 |
| 用户关闭 | 停止 | 断开 |
| 切换标签 | 保持 | 保持 |

### 3. Chrome Extension - Service Worker

**职责：**
- 执行浏览器控制操作
- 管理 CDP 连接
- 路由请求到对应处理器

### 4. Content Script

**职责：**
- 复杂 DOM 查询
- 遮罩层 UI 显示
- 控制台日志收集

---

## 数据流

### 完整请求流程

```
1. 用户对 Claude 说: "打开 google.com"
   │
   ▼
2. Claude 调用 MCP Tool: browser_navigate({url: "https://google.com"})
   │
   ▼
3. MCP Server 收到 JSON-RPC 请求
   │
   ▼
4. MCP Server 通过 WebSocket 发送到 Extension
   │
   ▼
5. Side Panel 收到消息，转发给 Service Worker
   │
   ▼
6. Service Worker 执行 CDP 命令
   │
   ▼
7. Chrome 执行导航
   │
   ▼
8. 结果返回: Service Worker → Side Panel → WebSocket → MCP Server → Claude
```

---

## 消息协议

### WebSocket 消息格式

**请求 (MCP Server → Extension):**
```json
{
  "type": "REQUEST",
  "id": "req_123",
  "action": "navigate",
  "params": {
    "url": "https://example.com"
  }
}
```

**响应 (Extension → MCP Server):**
```json
{
  "type": "RESPONSE",
  "id": "req_123",
  "payload": {
    "success": true,
    "data": { "url": "https://example.com", "title": "Example" }
  }
}
```

---

## 技术栈

| 类别 | 技术选型 | 说明 |
|------|----------|------|
| 扩展框架 | Chrome Extension Manifest V3 | 最新标准 |
| 开发语言 | TypeScript | 类型安全 |
| 构建工具 | Vite + CRXJS | 快速热重载 |
| MCP Server | Go + mcp-go | MCP 协议实现 |
| 扩展通信 | WebSocket | Side Panel 连接 |
| 浏览器控制 | chrome.debugger (CDP) | 核心自动化能力 |
| 包管理 | pnpm | 高效依赖管理 |

---

## 项目结构

```
browser-agent-extension/
├── extension/
│   ├── src/
│   │   ├── background/           # Service Worker
│   │   │   └── index.ts          # 消息路由 + CDP 操作
│   │   │
│   │   ├── sidepanel/            # Side Panel
│   │   │   ├── index.html        # 页面
│   │   │   └── sidepanel.ts      # WebSocket + UI
│   │   │
│   │   ├── cdp/                  # CDP 封装层
│   │   │   ├── transport.ts      # ExtensionTransport
│   │   │   ├── page.ts           # Page 操作
│   │   │   └── context.ts        # BrowserContext
│   │   │
│   │   ├── content/              # Content Script
│   │   │   └── index.ts          # DOM 辅助 + 遮罩层
│   │   │
│   │   └── types/                # 类型定义
│   │
│   ├── manifest.json
│   ├── package.json
│   └── vite.config.ts
│
└── mcp-server/                   # Go MCP Server
    ├── main.go                   # 入口
    ├── tools.go                  # MCP 工具定义
    ├── websocket.go              # WebSocket 服务
    └── go.mod
```

---

## 参考项目

### 1. anthropics/anthropic-quickstarts - computer-use-demo

**项目地址：** https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo

**参考内容：**
- Computer Use 的整体实现思路
- 工具定义模式 (ToolCollection, ToolResult)
- 截图和鼠标/键盘操作的实现方式

### 2. anthropics/mcp-go

**项目地址：** https://github.com/anthropics/mcp-go

**参考内容：**
- Go 语言 MCP Server 实现
- MCP 协议的标准工具定义方式
- stdio 通信的处理模式

### 3. anthropics/mcp-typescript

**项目地址：** https://github.com/anthropics/mcp-typescript

**参考内容：**
- TypeScript MCP 实现参考
- 类型定义规范

### 4. anthropics/stagehand

**项目地址：** https://github.com/browserbase/stagehand

**参考内容：**
- 浏览器自动化的 API 设计
- 页面操作的封装模式 (Page, BrowserContext)
- CDP 命令的组织方式

### 5. anthropics/browser-tools-mcp

**项目地址：** https://github.com/anthropics/anthropic-quickstarts/tree/main/browser-tools-mcp

**参考内容：**
- 浏览器 MCP 工具的定义方式
- 截图、导航、点击等操作的参数设计

---

## 与其他方案对比

| 方案 | Native Messaging | 独立 HTTP Server | MCP + Side Panel |
|------|-----------------|------------------|------------------|
| 外部进程 | Go 程序 | Node.js/Go | Go MCP Server |
| 通信协议 | stdin/stdout | HTTP/WebSocket | MCP + WebSocket |
| 常驻页面 | 不需要 | 需要 | Side Panel |
| AI 集成 | 需要适配 | 需要适配 | 原生支持 |
| 用户界面 | 无 | 无 | 有 |

### 为什么选择 MCP + Side Panel

**优势：**
1. **AI 原生集成** - Claude Desktop / Cursor 直接支持
2. **用户体验** - Side Panel 显示任务状态
3. **架构简洁** - 无需 Offscreen Document 或常驻标签页

**限制：**
1. 需要用户手动打开 Side Panel
2. Side Panel 关闭后无法接收命令

---

## 端口配置

| 服务 | 端口 | 说明 |
|------|------|------|
| MCP Server WebSocket | 3026 | 扩展连接 |

---

## 安全考虑

1. **WebSocket** - 仅监听 127.0.0.1
2. **扩展权限** - debugger, tabs, sidePanel, activeTab, scripting
3. **MCP** - stdio 通信，无网络暴露
