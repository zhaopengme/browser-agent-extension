# YAML Pipeline CLI Design (Consolidated Spec)

Date: 2026-04-03
Status: Draft

## Goal

Add a Go CLI tool (`bae`) to the browser-agent-extension monorepo that executes YAML-defined pipelines to extract structured data from websites, powered by the existing Chrome extension as the browser backend.

## Architecture

```
browser-agent-extension/
├── extension/              # unchanged
├── mcp-server/             # unchanged
└── cli/                    # new Go CLI
    ├── go.mod
    ├── main.go
    └── internal/
        ├── adapter/        # YAML parsing
        │   ├── parser.go
        │   └── types.go
        ├── pipeline/       # execution engine
        │   ├── engine.go
        │   ├── context.go
        │   ├── template.go
        │   └── steps/
        │       ├── data/       # local: map, filter, sort, limit, select, evaluate, tap
        │       └── browser/    # forwarded: navigate, click, type, wait, intercept, download
        ├── bridge/         # WebSocket communication
        │   ├── client.go
        │   └── action.go
        └── output/         # formatting
            ├── table.go
            ├── json.go
            └── csv.go
```

## Data Flow

```
bae run adapters/hackernews/top.yaml --limit 10
  │
  ├─ 1. Parse YAML → AdapterConfig
  ├─ 2. Create PipelineContext (args, vars, items)
  ├─ 3. Execute pipeline steps sequentially:
  │     ├─ data steps (map/filter/sort/limit/select/evaluate/tap) → local execution
  │     ├─ browser steps (navigate/click/type/wait) → bridge.Send() → extension
  │     └─ fetch → local HTTP (public) or via extension (cookie/header/intercept)
  └─ 4. Render output → table/json/csv
```

Strict sequential execution, no concurrency.

## YAML Adapter Format

Compatible with opencli-rs:

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

Library: [expr-lang/expr](https://github.com/expr-lang/expr)

```go
type ExprEnv struct {
    Item  any            // Current data item
    Index int            // Current index (0-based)
    Args  map[string]any // User-provided arguments
    Vars  map[string]any // Pipeline-scoped variables
}
```

Supported syntax:
- Variable access: `${{ item.title }}`
- Math: `${{ Math.min(args.limit, 50) }}`
- Ternary: `${{ args.limit ? args.limit : 20 }}`
- Boolean: `${{ item.score > 100 && !item.dead }}`
- String concat: `${{ "https://api.example.com/" + item.id }}`

## Step Types

### Data steps (local execution)

| Step | Input | Output | Description |
|------|-------|--------|-------------|
| `map` | items | items | Transform each item via expressions |
| `filter` | items | items | Keep items matching condition |
| `sort` | items | items | Sort by expression |
| `limit` | items | items | Truncate to N items |
| `select` | items | items | Pick specific fields |
| `evaluate` | items | items | Run JS via extension `evaluate` action |
| `tap` | items | items | Debug output, pass through |

### Browser steps (forwarded to extension)

| Step | Extension Action | Notes |
|------|------------------|-------|
| `navigate: url` | `navigate` | `{url: url}` |
| `click: selector` | `click` | `{selector: s}` or `{index: n}` |
| `type: text` | `type` | `{selector: s, text: text}` |
| `wait: selector` | `wait_for_selector` | `{selector: s, timeout?: ms}` |
| `wait: <number>` | `wait_for_timeout` | `{ms: number}` |
| `evaluate: expr` | `evaluate` | `{script: expr}` |
| `intercept: urlPattern` | `enable_network` → `wait_for_response` | Combined call |
| `download: url` | `download` | `{url: url}` or `{index: n}` |

### Mixed step: fetch

Execution path depends on `strategy`:

| Strategy | Execution |
|----------|-----------|
| `public` | Go `net/http` direct request |
| `cookie` | Get cookies from extension via `get_cookies`, then HTTP request |
| `header` | Get headers from extension context (deferred — treat as public for now) |
| `intercept` | Route through extension network interception (deferred — treat as public for now) |

## Bridge Communication

Direct WebSocket connection to extension on port 3026.

### Request/Response Format

```go
type BridgeRequest struct {
    Type   string         `json:"type"`   // "REQUEST"
    ID     string         `json:"id"`
    Action string         `json:"action"`
    Params map[string]any `json:"params"`
}

type BridgeResponse struct {
    Type    string          `json:"type"`    // "RESPONSE"
    ID      string          `json:"id"`
    Payload BridgePayload   `json:"payload"`
}

type BridgePayload struct {
    Success bool   `json:"success"`
    Data    any    `json:"data,omitempty"`
    Error   string `json:"error,omitempty"`
}
```

### Lifecycle

1. CLI connects `ws://localhost:3026`
2. Send request, wait for matching response by ID
3. Per-step timeout: 30s (configurable)
4. No reconnection — error out on disconnect

## CLI Commands

```
bae run <adapter.yaml> [flags]     Execute an adapter pipeline
bae list                            List available adapters
bae show <adapter.yaml>             Show adapter details
bae validate <adapter.yaml>         Validate adapter syntax
bae doctor                          Check extension connection
```

### Global Flags

```
--output, -o    table (default) | json | csv
--timeout       Step timeout, default 30s
--verbose, -v   Verbose logging
```

## Error Handling

- **Connection failure** → Error message with hint to start extension
- **Step failure** → Print step name, action, and error; exit with code 1
- **Expression evaluation failure** → Print expression and error; exit with code 1
- **YAML parse failure** → Print line and column of error
- **Timeout** → Print step name, timeout duration, and suggestion to increase `--timeout`

## Adapter Discovery

`bae list` searches these paths for `*.yaml` files:
1. `adapters/` relative to current working directory
2. `~/.bae/adapters/` (global adapter directory)

## Tech Stack

| Component | Library |
|-----------|---------|
| CLI framework | github.com/spf13/cobra |
| YAML | gopkg.in/yaml.v3 |
| Expressions | github.com/expr-lang/expr |
| WebSocket | github.com/gorilla/websocket |
| HTTP | net/http (stdlib) |
| Table output | github.com/jedib0t/go-pretty/v6 |
| JSON | encoding/json (stdlib) |
| CSV | encoding/csv (stdlib) |

Go module: `go 1.22`

## Out of Scope (Future)

- AI site exploration (explore/generate/cascade)
- Concurrent pipeline execution
- Adapter marketplace / sharing
- `header` and `intercept` fetch strategies (treat as `public` for now)
- `wait: <number>` vs `wait: {timeout: ms}` disambiguation (both map to `wait_for_timeout`)
