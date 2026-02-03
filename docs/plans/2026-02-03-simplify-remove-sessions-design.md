# 简化架构：移除 Session 概念设计文档

## 概述

将多 session 架构简化为无 session 架构，所有 MCP 客户端共享同一个浏览器标签页。

## 架构变更

### 之前（多 Session）
```
MCP Client A → Session A → Tab A
MCP Client B → Session B → Tab B
MCP Client C → Session C → Tab C
```

### 之后（无 Session）
```
MCP Client A ──┐
MCP Client B ──┼──> 当前活动标签页（共享）
MCP Client C ──┘
```

## 组件改动

### 1. Daemon (daemon.ts)

**删除：**
- `Session` 接口
- `sessions` Map
- `generateSessionId()`
- `handleRegister()`
- `handleDisconnect()`
- `SESSION_START/END` 消息
- session 前缀的请求 ID

**保留：**
- Unix Socket 服务器
- WebSocket 客户端（连接 Extension）
- 消息转发（MCP Server ↔ Extension）
- 空闲自动退出

**新消息格式：**
```typescript
// MCP Server → Daemon
{ type: 'REQUEST', id: 'req_123', action: 'navigate', params: {...} }

// Daemon → Extension（直接转发）
{ type: 'REQUEST', id: 'req_123', action: 'navigate', params: {...} }
```

### 2. MCP Server (mcp.ts)

**删除：**
- `sessionId` 变量
- `REGISTER` 消息发送
- `DISCONNECT` 消息发送
- session 前缀的请求 ID

**连接流程简化：**
```typescript
// 之前: 连接 → REGISTER → 等待 sessionId → 发送请求
// 之后: 连接 → 直接发送请求
```

### 3. Extension Sidepanel (sidepanel.ts)

**删除：**
- `sessionBindings` Map
- session 路由逻辑
- `requestedTabId` 参数处理
- `SESSION_START/END` 处理

**新请求处理：**
- 所有请求使用当前活动标签页
- 无活动标签页或受限 URL 时创建新标签

### 4. Session Binding (session-binding.ts)

**删除整个文件**

## 错误处理

| 场景 | 处理 |
|------|------|
| 无活动标签页 | 创建新标签页 |
| 受限 URL | 创建新标签页 |
| 并发请求 | 顺序执行，相互影响（设计预期） |

## 边界情况

- **并发操作**：多个 MCP 客户端会相互影响，这是设计预期的简化
- **标签页关闭**：操作前检查，已关闭则创建新标签
- **Daemon 退出**：空闲 60s 后退出，MCP Server 调用时自动重启

## 文件改动清单

| 文件 | 操作 |
|------|------|
| `mcp-server/src/daemon.ts` | 大幅简化，删除 session 管理 |
| `mcp-server/src/mcp.ts` | 删除 REGISTER/DISCONNECT |
| `extension/src/sidepanel/sidepanel.ts` | 简化请求处理，删除 session 路由 |
| `extension/src/sidepanel/session-binding.ts` | **删除** |
