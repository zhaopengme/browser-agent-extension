# Pipeline CLI Design

Date: 2026-04-02

## Goal

Add a Go CLI tool (`bae`) to the browser-agent-extension monorepo that executes YAML-defined pipelines to extract structured data from websites, powered by the existing Chrome extension as the browser backend.

## Scope

- YAML adapter parsing (compatible with opencli-rs format)
- Pipeline engine with 14 step types
- Expression engine (`${{ }}` syntax)
- WebSocket bridge to existing Chrome extension
- Multi-format output (table/json/csv)
- AI capabilities deferred to future iteration

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
  - fetch: https://hacker-news.firebaseio.com/v0/item/${{{ item.id }}.json
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

Available variables in expressions:

| Variable | Type | Description |
|----------|------|-------------|
| `item` | any | Current data item |
| `index` | int | Current item index |
| `args` | map | User-provided arguments |
| `vars` | map | Pipeline-scoped variables |

Supported syntax:
- Variable access: `item.title`
- Math: `Math.min(args.limit, 50)`, `index + 1`
- Ternary: `args.limit ? args.limit : 20`
- Boolean: `item.score > 100 && !item.dead`
- String concat: `"https://api.example.com/" + item.id`

## Step Types (14 total)

### Data steps (local execution)

| Step | Input | Output | Description |
|------|-------|--------|-------------|
| `map` | items | items | Transform each item via expressions |
| `filter` | items | items | Keep items matching condition |
| `sort` | items | items | Sort by expression |
| `limit` | items | items | Truncate to N items |
| `select` | items | items | Pick specific fields |
| `evaluate` | items | items | Run JS via extension |
| `tap` | items | items | Debug output, pass through |

### Browser steps (forwarded to extension)

| Step | Extension Action | Notes |
|------|------------------|-------|
| `navigate` | `navigate` | `{url: url}` |
| `click` | `click` | `{selector: s}` or `{index: n}` |
| `type` | `type` | `{selector: s, text: text}` |
| `wait` | `wait_for_selector` / `wait_for_timeout` | Depending on param type |
| `intercept` | `enable_network` + `wait_for_response` | Combined call |
| `download` | TBD | May need extension enhancement |

### Mixed step: fetch

Execution path depends on `strategy`:

| Strategy | Execution |
|----------|-----------|
| `public` | Go `net/http` direct request |
| `cookie` | Get cookies from extension, then HTTP request |
| `header` | Get headers from extension context |
| `intercept` | Route through extension network interception |

## Bridge Communication

Direct WebSocket connection to extension on port 3026.

### Protocol

```json
// Request (CLI → Extension)
{
  "type": "REQUEST",
  "id": "req_123",
  "action": "navigate",
  "params": {"url": "https://example.com"}
}

// Response (Extension → CLI)
{
  "type": "RESPONSE",
  "id": "req_123",
  "payload": {
    "success": true,
    "data": {...}
  }
}
```

### Lifecycle

1. CLI connects `ws://localhost:3026`
2. Send request, wait for matching response by ID
3. Per-step timeout: 30s (configurable)
4. No reconnection — error out on disconnect

## CLI Interface

```
bae run <adapter.yaml> [flags]     Execute an adapter pipeline
bae list                            List available adapters
bae show <adapter.yaml>             Show adapter details
bae validate <adapter.yaml>         Validate adapter syntax
bae doctor                          Check extension connection
```

### Global flags

```
--output, -o    table (default) | json | csv
--timeout       Step timeout, default 30s
--verbose, -v   Verbose logging
```

## Dependencies

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

## Out of Scope (future)

- AI site exploration (explore/generate/cascade)
- Concurrent pipeline execution
- Adapter marketplace / sharing
- Authentication management UI
