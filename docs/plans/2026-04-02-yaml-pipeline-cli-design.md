# YAML Pipeline CLI Design

## Overview

在 browser-agent-extension 仓库内新增 Go CLI 工具，实现 YAML 声明式管道引擎，让用户能通过 YAML 配置编排浏览器自动化流程和数据提取。复用现有 Chrome 扩展的浏览器能力，CLI 只负责解析和编排。

## Architecture

```
browser-agent-extension/
├── extension/          # 现有 Chrome 扩展（不变）
├── mcp-server/         # 现有 MCP Server（不变）
└── cli/                # 新增 Go CLI
    ├── go.mod
    ├── main.go
    └── internal/
        ├── adapter/
        │   ├── parser.go       # YAML → AdapterConfig
        │   └── types.go        # 适配器类型定义
        ├── pipeline/
        │   ├── engine.go       # 管道编排器（顺序执行）
        │   ├── context.go      # 执行上下文（args, items, vars）
        │   ├── template.go     # ${{ }} → expr-lang/expr
        │   └── steps/
        │       ├── data/       # 本地执行：map, filter, sort, limit, select, evaluate, tap
        │       │   ├── map.go
        │       │   ├── filter.go
        │       │   ├── sort.go
        │       │   ├── limit.go
        │       │   ├── select.go
        │       │   ├── evaluate.go
        │       │   └── tap.go
        │       └── browser/    # 转发扩展：navigate, click, type, wait, intercept, download
        │           ├── navigate.go
        │           ├── click.go
        │           ├── type.go
        │           ├── wait.go
        │           ├── intercept.go
        │           └── download.go
        ├── bridge/
        │   ├── client.go       # WebSocket 连接管理
        │   └── action.go       # 步骤 → 扩展 action 映射
        └── output/
            ├── table.go
            ├── json.go
            └── csv.go
```

## Data Flow

```
用户: bae run adapters/hackernews/top.yaml --limit 10
    │
    ▼
1. 解析 YAML → AdapterConfig (strategy, args, pipeline, columns)
2. 创建 PipelineContext (args, variables, items)
3. 逐步顺序执行 pipeline:
   ├── fetch (public)    → CLI 直接 HTTP
   ├── fetch (cookie)    → bridge → 扩展获取 cookie → CLI HTTP
   ├── navigate/click/type/wait → bridge → 扩展 CDP 执行
   ├── intercept         → bridge → enable_network + wait_for_response
   ├── map/filter/sort/limit/select/evaluate/tap → CLI 本地数据变换
   └── download          → bridge → 扩展下载
4. 输出结果 → table/json/csv
```

所有步骤严格顺序执行，无并发。

## YAML Adapter Format

兼容 opencli-rs 适配器格式：

```yaml
site: hackernews
name: top
description: Hacker News top stories
strategy: public        # public | cookie | header | intercept | ui
browser: false

args:
  limit:
    type: int
    default: 20
    description: Number of stories
  keyword:
    type: str
    default: ""

pipeline:
  - fetch: https://hacker-news.firebaseio.com/v0/topstories.json
  - limit: "${{ Math.min(args.limit + 10, 50) }}"
  - map:
      id: ${{ item }}
  - fetch: https://hacker-news.firebaseio.com/v0/item/${{ item.id }}.json
  - filter: item.title && !item.deleted
  - map:
      rank: ${{ index + 1 }}
      title: ${{ item.title }}
      score: ${{ item.score }}
      author: ${{ item.by }}
  - limit: ${{ args.limit }}

columns: [rank, title, score, author]
```

## Expression Engine

使用 github.com/expr-lang/expr 库。

上下文变量：

```go
type ExprEnv struct {
    Item  any   // 当前数据项
    Index int   // 当前索引（从 0 开始）
    Args  Map   // 用户传入参数
    Vars  Map   // 管道内变量
}
```

支持语法：
- 变量引用：`${{ item.title }}`
- 数学运算：`${{ Math.min(args.limit, 50) }}`
- 条件表达式：`${{ args.limit ? args.limit : 20 }}`
- 过滤条件：`${{ item.score > 100 && !item.dead }}`
- 字符串拼接：`${{ "https://api.example.com/" + item.id }}`

## Bridge Communication

Go CLI 通过 WebSocket 直连扩展（端口 3026），复用现有消息协议。

### 消息格式

```go
// 请求
type Request struct {
    Type   string         `json:"type"`   // "REQUEST"
    ID     string         `json:"id"`
    Action string         `json:"action"`
    Params map[string]any `json:"params"`
}

// 响应
type Response struct {
    Type    string         `json:"type"`    // "RESPONSE"
    ID      string         `json:"id"`
    Payload ResponsePayload `json:"payload"`
}

type ResponsePayload struct {
    Success bool   `json:"success"`
    Data     any    `json:"data,omitempty"`
    Error    string `json:"error,omitempty"`
}
```

### Step → Action Mapping

| 管道步骤 | 扩展 Action | 参数转换 |
|----------|-------------|----------|
| `navigate: url` | `navigate` | `{url: url}` |
| `click: selector` | `click` | `{selector: selector}` 或 `{index: n}` |
| `type: text` | `type` | `{selector: ..., text: text}` |
| `wait: selector` | `wait_for_selector` | `{selector: selector}` |
| `wait: timeout` | `wait_for_timeout` | `{timeout: ms}` |
| `evaluate: expr` | `evaluate` | `{expression: expr}` |
| `intercept: url` | `enable_network` → 操作 → `wait_for_response` | 组合调用 |
| `download: url` | 待定 | 可能需扩展新增 |

### Bridge Lifecycle

```
CLI 启动 → 连接 ws://localhost:3026 → 心跳保活 → 执行管道步骤 → 断开
```

- 连接失败 → 报错提示用户检查扩展
- 单步超时 → 默认 30s，可配置
- 不做断线重连

## CLI Commands

```bash
# 执行适配器
bae run <adapter.yaml> [--limit 10] [--keyword "rust"]

# 列出可用适配器
bae list

# 查看适配器详情
bae show <adapter.yaml>

# 验证适配器语法
bae validate <adapter.yaml>

# 检查扩展连接
bae doctor
```

### Global Flags

```
--output, -o    table（默认）| json | csv | yaml
--timeout       单步超时，默认 30s
--verbose, -v   详细日志
--help, -h      帮助
```

## Tech Stack

| 组件 | Go 库 |
|------|-------|
| CLI 框架 | cobra |
| YAML 解析 | gopkg.in/yaml.v3 |
| 表达式引擎 | github.com/expr-lang/expr |
| WebSocket | github.com/gorilla/websocket |
| HTTP 客户端 | net/http（标准库） |
| 表格输出 | github.com/jedib0t/go-pretty/v6 |
| JSON | encoding/json（标准库） |
| CSV | encoding/csv（标准库） |

Go module: `go 1.22`

## Future (NOT in scope)

- AI 站点探索 / 适配器自动生成（后续扩展）
- 认证策略自动检测（cascade）
- 并发 fetch
- 多格式输出中的 Markdown
