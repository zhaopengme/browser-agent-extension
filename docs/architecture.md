# 架构设计文档

## 概述

本项目采用 **MCP (Model Context Protocol) + Side Panel + WebSocket** 架构，实现 AI Agent 对浏览器的自动化控制。

## 整体架构

### 单客户端模式（传统模式）

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    AI 客户端 (Claude Desktop / Cursor / 其他)               │
│                              MCP Client                                     │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ stdio (JSON-RPC 2.0)
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        TypeScript MCP Server                                │
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

### 多客户端模式（Daemon 架构）

```
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│  Claude Desktop      │      │      Cursor          │      │   Other MCP Client   │
│  (MCP Client #1)     │      │   (MCP Client #2)    │      │   (MCP Client #3)    │
└──────────┬───────────┘      └──────────┬───────────┘      └──────────┬───────────┘
           │ stdio                       │ stdio                       │ stdio
           ▼                             ▼                             ▼
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│  MCP Server #1       │      │   MCP Server #2      │      │   MCP Server #3      │
│  (Session: sess_1)   │      │  (Session: sess_2)   │      │  (Session: sess_3)   │
└──────────┬───────────┘      └──────────┬───────────┘      └──────────┬───────────┘
           │ Unix Socket                │ Unix Socket                │ Unix Socket
           └────────┬───────────────────┴────────┬───────────────────┴────────┘
                    ▼                         ▼
           ┌─────────────────────────────────────────────┐
           │           Browser Agent Daemon              │
           │  - Unix Socket Server (/tmp/...sock)        │
           │  - Session Management & Routing             │
           │  - WebSocket Client (连接 Extension)        │
           │  - Auto-exit after 60s idle                 │
           └──────────────────┬──────────────────────────┘
                              │ WebSocket
                              ▼
           ┌─────────────────────────────────────────────┐
           │           Chrome Extension                  │
           │  ┌───────────────────────────────────────┐  │
           │  │  Side Panel                          │  │
           │  │  - Session List UI                   │  │
           │  │  - Session-to-Tab Binding            │  │
           │  │  - Request Routing                   │  │
           │  └───────────────┬───────────────────────┘  │
           │                  │ chrome.runtime.sendMessage│
           │  ┌───────────────▼───────────────────────┐  │
           │  │  Service Worker                      │  │
           │  │  - Multi-tab Management              │  │
           │  │  - Per-tab Operations                │  │
           │  └───────────────┬───────────────────────┘  │
           └──────────────────┴──────────────────────────┘
                              │
                              ▼
                       Chrome Browser (Multiple Tabs)
                ┌──────────┬──────────┬──────────┐
                │  Tab #1  │  Tab #2  │  Tab #3  │
                │ (sess_1) │ (sess_2) │ (sess_3) │
                └──────────┴──────────┴──────────┘
```

**多客户端模式特点：**
- 多个 MCP 客户端可以同时连接，每个客户端获得独立会话
- 每个会话绑定到独立的浏览器标签页
- Daemon 自动启动，无活跃会话时自动退出
- 完全向后兼容单客户端模式

---

## 核心组件

### 1. TypeScript MCP Server

**职责：**
- 实现 MCP 协议，提供标准化的工具接口
- 通过 stdio 与 AI 客户端通信 (JSON-RPC 2.0)
- 自动检测并连接 Daemon（多客户端模式）
- 回退到直接 WebSocket 连接（单客户端模式）
- 请求转发和响应路由

**通信协议：**

| 接口 | 协议 | 说明 |
|------|------|------|
| AI 客户端 | stdio (JSON-RPC 2.0) | MCP 标准协议 |
| Daemon | Unix Socket | 多客户端模式 |
| Chrome 扩展 | WebSocket (:3026) | 单客户端回退模式 |

### 1.5. Browser Agent Daemon（多客户端支持）

**职责：**
- 管理多个 MCP 客户端会话
- Unix Socket 服务器接受 MCP Server 连接
- WebSocket 客户端连接浏览器扩展
- 会话注册和请求路由
- 自动启动和生命周期管理

**会话管理：**
- 每个 MCP Server 连接获得唯一 sessionId
- 请求携带 sessionId 路由到对应标签页
- 无活跃会话时 60 秒后自动退出

**通信协议：**

| 接口 | 协议 | 说明 |
|------|------|------|
| MCP Server | Unix Socket (/tmp/browser-agent-daemon.sock) | 会话注册和请求 |
| Chrome 扩展 | WebSocket (:3026) | 请求转发 |

### 2. Chrome Extension - Side Panel

**职责：**
- 维持 WebSocket 连接（仅在打开时）
- 显示任务执行状态和日志
- 管理会话到标签页的绑定
- 显示活跃会话列表和状态
- 转发请求到 Service Worker
- 提供用户界面

**生命周期：**

| 状态 | Side Panel | WebSocket | 会话管理 |
|------|-----------|-----------|---------|
| 用户打开 | 运行 | 连接 | 启用 |
| 用户关闭 | 停止 | 断开 | 清理 |
| 切换标签 | 保持 | 保持 | 保持 |

**会话功能：**
- 自动为每个 sessionId 创建独立标签页
- 实时显示会话状态和最后活跃时间
- 支持聚焦和关闭会话标签页

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

### Daemon 消息格式

**REGISTER (MCP Server → Daemon):**
```json
{
  "type": "REGISTER",
  "id": "reg_123"
}
```

**REGISTER_OK (Daemon → MCP Server):**
```json
{
  "type": "REGISTER_OK",
  "id": "reg_123",
  "sessionId": "sess_a1b2c3d4"
}
```

**REQUEST (MCP Server → Daemon):**
```json
{
  "type": "REQUEST",
  "id": "req_456",
  "sessionId": "sess_a1b2c3d4",
  "action": "navigate",
  "params": {
    "url": "https://example.com"
  }
}
```

**RESPONSE (Daemon → MCP Server):**
```json
{
  "type": "RESPONSE",
  "id": "req_456",
  "sessionId": "sess_a1b2c3d4",
  "payload": {
    "success": true,
    "data": { "url": "https://example.com" }
  }
}
```

**SESSION_START (Daemon → Extension):**
```json
{
  "type": "SESSION_START",
  "sessionId": "sess_a1b2c3d4"
}
```

**SESSION_END (Daemon → Extension / Extension → Daemon):**
```json
{
  "type": "SESSION_END",
  "sessionId": "sess_a1b2c3d4"
}
```

### WebSocket 消息格式

**请求 (MCP Server/Daemon → Extension):**
```json
{
  "type": "REQUEST",
  "id": "req_123",
  "sessionId": "sess_a1b2c3d4",
  "action": "navigate",
  "params": {
    "url": "https://example.com"
  }
}
```

**响应 (Extension → MCP Server/Daemon):**
```json
{
  "type": "RESPONSE",
  "id": "req_123",
  "sessionId": "sess_a1b2c3d4",
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
| MCP Server | TypeScript + @modelcontextprotocol/sdk | MCP 协议实现 |
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
│   │   │   └── sidepanel.ts      # WebSocket + 会话管理 + UI
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
└── mcp-server/                   # TypeScript MCP Server
    ├── src/
    │   ├── index.ts              # 入口 + MCP 工具定义 + Daemon 连接
    │   └── daemon.ts             # Daemon 进程（多客户端支持）
    ├── package.json
    └── tsconfig.json
```

---

## 参考项目

### 1. anthropics/anthropic-quickstarts - computer-use-demo

**项目地址：** https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo

**参考内容：**
- Computer Use 的整体实现思路
- 工具定义模式 (ToolCollection, ToolResult)
- 截图和鼠标/键盘操作的实现方式

### 2. modelcontextprotocol/typescript-sdk

**项目地址：** https://github.com/modelcontextprotocol/typescript-sdk

**参考内容：**
- TypeScript MCP Server 实现
- MCP 协议的标准工具定义方式
- stdio 通信的处理模式

### 3. browserbase/stagehand

**项目地址：** https://github.com/browserbase/stagehand

**参考内容：**
- 浏览器自动化的 API 设计
- 页面操作的封装模式 (Page, BrowserContext)
- CDP 命令的组织方式

### 4. anthropics/browser-tools-mcp

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

| 服务 | 端口/路径 | 说明 |
|------|----------|------|
| MCP Server WebSocket | 3026 | 扩展连接（单客户端回退模式） |
| Daemon Unix Socket | /tmp/browser-agent-daemon.sock | MCP Server 连接（多客户端模式） |
| Daemon WebSocket | 3026 | 扩展连接（多客户端模式） |

---

## 安全考虑

1. **WebSocket** - 仅监听 127.0.0.1
2. **Unix Socket** - 权限设置为 0600（仅所有者可访问）
3. **扩展权限** - debugger, tabs, sidePanel, activeTab, scripting
4. **MCP** - stdio 通信，无网络暴露
5. **Daemon** - 自动退出机制防止僵尸进程
