# Hono MCP Server 重构设计

## 概述

将现有的 MCP Server 从 `stdio` + `Unix Socket` + `ws` 架构重构为单一的 **Hono HTTP 服务器**，同时提供 MCP Streamable HTTP 端点和 WebSocket 端点。

## 目标

1. 简化架构：去除 Unix Socket 中间层，统一使用 Hono
2. 支持 MCP Streamable HTTP Transport
3. 保持 WebSocket 与浏览器扩展的实时通信
4. 内存中的请求协调（BridgeStore 模式）

## 架构图

```
┌─────────────────┐     HTTP Streamable      ┌─────────────────────────────┐
│   Claude/Code   │ ◄──────────────────────► │  Hono Server                │
│  (MCP Client)   │                          │  ├── /mcp (MCP Transport)   │
└─────────────────┘                          │  └── /ws  (WebSocket)       │
                                             │         ▲                   │
                                             │         │                   │
                                             │    BridgeStore              │
                                             │    (请求协调)                │
                                             └─────────┼───────────────────┘
                                                       │
                                                  WebSocket
                                                       │
                                             ┌─────────▼───────────┐
                                             │  Browser Extension  │
                                             │  (Chrome/Firefox)   │
                                             └─────────────────────┘
```

## 核心组件

### 1. BridgeStore

职责：
- 维护 `pendingRequests: Map<string, Deferred>`
- 维护 `extensionSocket: WebSocket | null`
- 管理服务器状态：`idle` | `ready` | `busy`
- 生成唯一的 `requestId`

状态定义：
```typescript
type BridgeState =
  | { status: 'idle' }           // 无扩展连接
  | { status: 'ready' }          // 扩展已连接，空闲
  | { status: 'busy', requestId: string };  // 正在处理请求
```

### 2. MCP Handler

- 挂载路径：`/mcp`
- 使用 `StreamableHTTPTransport` 处理 MCP 协议
- 注册 35+ 个 browser automation tools
- 每个 tool 的 execute 调用 `bridgeStore.sendRequest()`

### 3. WebSocket Handler

- 挂载路径：`/ws`
- 使用 `upgradeWebSocket` 处理浏览器扩展连接
- 只接受单个扩展连接，拒绝后续连接
- 处理消息：HELLO、RESPONSE、ERROR、STATUS

## 请求流转

```
1. Claude 调用 tool (如 browser_click)
   │
   ▼
2. MCP Handler → bridgeStore.sendRequest(data)
   │
   ├─► 检查状态：必须为 'ready'，否则报错
   ├─► 生成 requestId
   ├─► 创建 Promise，存入 pendingRequests
   ├─► 状态变为 'busy'
   ├─► WebSocket 发送: { id, type: "REQUEST", payload }
   │
   ▼
3. 扩展执行操作，返回响应
   │
   ▼
4. WS Handler → bridgeStore.resolveResponse(id, result)
   │
   ├─► 从 pendingRequests 取出 Promise
   ├─► 状态变回 'ready'
   └─► resolve(result) → 返回给 Claude
```

## 消息协议

### 扩展 → Server

```typescript
type ExtMessage =
  | { type: 'HELLO', version: string }           // 连接握手
  | { type: 'RESPONSE', id: string, result: unknown }
  | { type: 'ERROR', id: string, error: string }
  | { type: 'STATUS', connected: boolean };      // 页面状态变化
```

### Server → 扩展

```typescript
type ServerMessage =
  | { type: 'REQUEST', id: string, payload: unknown }
  | { type: 'PING' };
```

## 错误处理策略

| 场景 | 处理方式 |
|------|----------|
| 扩展未连接 | 返回 McpError: "Browser extension not connected" |
| 扩展忙 | 返回 McpError: "Browser busy processing another request" |
| 扩展断开 | 清理所有 pending requests，reject with error |
| 请求超时 | 60s 超时，自动 reject |
| 扩展响应 error | 透传给 MCP |

## 文件结构

```
mcp-server/
├── src/
│   ├── main.ts              # 入口：创建 Hono app，启动服务器
│   ├── bridge/
│   │   ├── store.ts         # BridgeStore 类
│   │   └── types.ts         # 类型定义
│   ├── mcp/
│   │   ├── server.ts        # McpServer 实例创建
│   │   ├── handler.ts       # /mcp 路由处理
│   │   └── tools/
│   │       ├── index.ts     # 工具注册入口
│   │       ├── navigation.ts    # navigate, click, type, scroll
│   │       ├── info.ts          # get_dom_tree, screenshot, page_info
│   │       ├── tabs.ts          # get_tabs, switch_tab
│   │       ├── network.ts       # enable_network, wait_for_response
│   │       ├── waiting.ts       # wait_for_selector, timeout, load_state
│   │       ├── interaction.ts   # upload, dialog, console
│   │       └── advanced.ts      # hover, double_click, download
│   ├── ws/
│   │   └── handler.ts       # /ws 路由处理
│   └── utils/
│       ├── config.ts        # 配置（端口、超时等）
│       └── errors.ts        # 错误处理
├── package.json
└── tsconfig.json
```

## 依赖变更

移除：
- `ws` (改用 Hono 内置 WebSocket)

添加：
- `hono`
- `@hono/mcp` (如果需要，或直接使用 SDK 的 StreamableHTTPTransport)

## 启动流程

```typescript
// main.ts
1. 创建 BridgeStore 实例
2. 创建 McpServer，注册所有 tools
3. 配置 Hono 路由 (/mcp, /ws, /health)
4. Bun.serve({ fetch: app.fetch, websocket })
```

## 健康检查端点

```
GET /health
Response: { status: 'ok', extConnected: boolean, state: 'idle'|'ready'|'busy' }
```

## 约束

1. 单扩展：只接受一个浏览器扩展连接
2. 无队列：扩展忙时新请求立即返回错误
3. 无持久化：纯内存状态，重启丢失
4. 超时：60 秒请求超时

## 迁移步骤

1. 创建新的文件结构
2. 实现 BridgeStore
3. 实现 WebSocket handler
4. 迁移 35+ 个 MCP tools
5. 实现 MCP handler
6. 更新 package.json 依赖
7. 测试验证
8. 删除旧的 daemon.ts 和 mcp.ts
