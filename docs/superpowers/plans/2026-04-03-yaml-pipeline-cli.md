# YAML Pipeline CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Go CLI tool (`bae`) that executes YAML-defined pipelines to extract structured data from websites, using the existing Chrome extension as the browser backend via WebSocket.

**Architecture:** Go CLI with cobra commands, YAML parsing via gopkg.in/yaml.v3, expression engine via expr-lang/expr, WebSocket bridge via gorilla/websocket, table output via go-pretty. All sequential execution, no concurrency.

**Tech Stack:** Go 1.22, cobra, yaml.v3, expr, gorilla/websocket, go-pretty/v6

---

## File Structure

### New files to create

| File | Responsibility |
|------|---------------|
| `cli/go.mod` | Go module definition |
| `cli/main.go` | CLI entry point, cobra root command |
| `cli/internal/adapter/types.go` | AdapterConfig, Step, Arg types |
| `cli/internal/adapter/parser.go` | YAML → AdapterConfig parser + validation |
| `cli/internal/pipeline/context.go` | PipelineContext (args, items, vars) |
| `cli/internal/pipeline/template.go` | `${{ }}` expression template engine using expr |
| `cli/internal/pipeline/engine.go` | Pipeline orchestration: loop over steps, dispatch |
| `cli/internal/pipeline/steps/data/map.go` | `map` step: transform items via expr |
| `cli/internal/pipeline/steps/data/filter.go` | `filter` step: keep items matching expr |
| `cli/internal/pipeline/steps/data/sort.go` | `sort` step: order items by expr |
| `cli/internal/pipeline/steps/data/limit.go` | `limit` step: truncate to N items |
| `cli/internal/pipeline/steps/data/select.go` | `select` step: pick specific fields |
| `cli/internal/pipeline/steps/data/evaluate.go` | `evaluate` step: JS via extension |
| `cli/internal/pipeline/steps/data/tap.go` | `tap` step: debug print, pass through |
| `cli/internal/pipeline/steps/browser/navigate.go` | `navigate` step → bridge |
| `cli/internal/pipeline/steps/browser/click.go` | `click` step → bridge |
| `cli/internal/pipeline/steps/browser/type.go` | `type` step → bridge |
| `cli/internal/pipeline/steps/browser/wait.go` | `wait` step → bridge |
| `cli/internal/pipeline/steps/browser/intercept.go` | `intercept` step → bridge |
| `cli/internal/pipeline/steps/browser/download.go` | `download` step → bridge |
| `cli/internal/pipeline/steps/browser/fetch.go` | `fetch` step: HTTP or via bridge |
| `cli/internal/bridge/client.go` | WebSocket connection, send/recv with timeout |
| `cli/internal/bridge/action.go` | Step → extension action mapping |
| `cli/internal/output/table.go` | Table output via go-pretty |
| `cli/internal/output/json.go` | JSON output |
| `cli/internal/output/csv.go` | CSV output |

### Files to modify

| File | Change |
|------|--------|
| `.gitignore` | Add `cli/bin/bae` (compiled binary) |

---

### Task 1: Go Module and CLI Entry Point

**Files:**
- Create: `cli/go.mod`
- Create: `cli/main.go`

- [ ] **Step 1: Initialize Go module**

Create `cli/go.mod`:

```go
module github.com/agents-cc/browser-agent-extension/cli

go 1.22

require (
	github.com/expr-lang/expr v1.17.5
	github.com/gorilla/websocket v1.5.3
	github.com/jedib0t/go-pretty/v6 v6.6.7
	github.com/spf13/cobra v1.8.1
	gopkg.in/yaml.v3 v3.0.1
)
```

- [ ] **Step 2: Create main.go with root command**

Create `cli/main.go`:

```go
package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	version = "dev"
	verbose bool
)

var rootCmd = &cobra.Command{
	Use:   "bae",
	Short: "Browser Agent Extension CLI — YAML-driven pipeline engine for web data extraction",
	Long: `bae executes YAML-defined pipelines to extract structured data from websites,
powered by the Browser Agent Extension as the browser backend.`,
	SilenceUsage: true,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Verbose logging")
}

func main() {
	Execute()
}
```

- [ ] **Step 3: Verify module and build**

Run:
```bash
cd cli && go mod tidy && go build -o bin/bae .
```

Expected: Binary compiles successfully at `cli/bin/bae`.

- [ ] **Step 4: Test the binary runs**

Run:
```bash
./cli/bin/bae --help
```

Expected:
```
bae executes YAML-defined pipelines to extract structured data from websites,
powered by the Browser Agent Extension as the browser backend.

Usage:
  bae [command]

Available Commands:
  ...
```

- [ ] **Step 5: Commit**

```bash
git add cli/go.mod cli/go.sum cli/main.go
git commit -m "feat(cli): scaffold Go module and root command"
```

---

### Task 2: Adapter Types and Parser

**Files:**
- Create: `cli/internal/adapter/types.go`
- Create: `cli/internal/adapter/parser.go`

- [ ] **Step 1: Define adapter types**

Create `cli/internal/adapter/types.go`:

```go
package adapter

// AdapterConfig is the top-level YAML adapter structure.
type AdapterConfig struct {
	Site        string         `yaml:"site"`
	Name        string         `yaml:"name"`
	Description string         `yaml:"description"`
	Strategy    string         `yaml:"strategy"` // public | cookie | header | intercept | ui
	Browser     bool           `yaml:"browser"`
	Args        map[string]Arg `yaml:"args"`
	Pipeline    []Step         `yaml:"pipeline"`
	Columns     []string       `yaml:"columns"`
}

// Arg defines a pipeline argument with type and default.
type Arg struct {
	Type        string `yaml:"type"`        // int | str | bool
	Default     any    `yaml:"default"`
	Description string `yaml:"description"`
}

// Step is a single pipeline step. One key will be set.
type Step struct {
	Fetch       string         `yaml:"fetch,omitempty"`
	Navigate    string         `yaml:"navigate,omitempty"`
	Click       any            `yaml:"click,omitempty"`        // string (selector) or map
	Type        map[string]any `yaml:"type,omitempty"`
	Wait        any            `yaml:"wait,omitempty"`         // string (selector), number (timeout), or map
	Intercept   string         `yaml:"intercept,omitempty"`
	Download    any            `yaml:"download,omitempty"`     // string (url) or map
	Map         map[string]any `yaml:"map,omitempty"`
	Filter      any            `yaml:"filter,omitempty"`       // string expression
	Sort        any            `yaml:"sort,omitempty"`         // string expression
	Limit       any            `yaml:"limit,omitempty"`        // int or string expression
	Select      any            `yaml:"select,omitempty"`       // []string or map
	Evaluate    string         `yaml:"evaluate,omitempty"`
	Tap         *bool          `yaml:"tap,omitempty"`          // true → print all, or map for custom
}
```

- [ ] **Step 2: Write YAML parser**

Create `cli/internal/adapter/parser.go`:

```go
package adapter

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Parse reads a YAML file and returns an AdapterConfig.
func Parse(path string) (*AdapterConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}

	var cfg AdapterConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse yaml: %w", err)
	}

	if err := Validate(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// Validate checks required fields and valid values.
func Validate(cfg *AdapterConfig) error {
	if cfg.Site == "" {
		return fmt.Errorf("missing required field: site")
	}
	if cfg.Name == "" {
		return fmt.Errorf("missing required field: name")
	}
	if len(cfg.Pipeline) == 0 {
		return fmt.Errorf("pipeline must have at least one step")
	}

	// Default strategy
	if cfg.Strategy == "" {
		cfg.Strategy = "public"
	}

	// Validate strategy
	validStrategies := map[string]bool{
		"public": true, "cookie": true, "header": true, "intercept": true, "ui": true,
	}
	if !validStrategies[cfg.Strategy] {
		return fmt.Errorf("invalid strategy: %s", cfg.Strategy)
	}

	return nil
}

// Discover searches for *.yaml files in adapters/ (cwd) and ~/.bae/adapters/.
func Discover() ([]string, error) {
	var found []string

	// Search cwd/adapters/
	localDir := filepath.Join(".", "adapters")
	if files, err := yamlFiles(localDir); err == nil {
		found = append(found, files...)
	}

	// Search ~/.bae/adapters/
	home, err := os.UserHomeDir()
	if err == nil {
		globalDir := filepath.Join(home, ".bae", "adapters")
		if files, err := yamlFiles(globalDir); err == nil {
			found = append(found, files...)
		}
	}

	return found, nil
}

func yamlFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".yaml") {
			files = append(files, filepath.Join(dir, e.Name()))
		}
	}
	return files, nil
}
```

- [ ] **Step 3: Write parser tests**

Create `cli/internal/adapter/parser_test.go`:

```go
package adapter

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseValidYAML(t *testing.T) {
	content := `
site: test
name: example
strategy: public
pipeline:
  - fetch: https://example.com
`
	tmp := writeTempFile(t, content)
	cfg, err := Parse(tmp)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Site != "test" {
		t.Errorf("expected site 'test', got '%s'", cfg.Site)
	}
	if len(cfg.Pipeline) != 1 {
		t.Errorf("expected 1 step, got %d", len(cfg.Pipeline))
	}
}

func TestParseMissingSite(t *testing.T) {
	content := `
name: example
pipeline:
  - fetch: https://example.com
`
	tmp := writeTempFile(t, content)
	_, err := Parse(tmp)
	if err == nil {
		t.Fatal("expected error for missing site")
	}
}

func TestParseEmptyPipeline(t *testing.T) {
	content := `
site: test
name: example
pipeline: []
`
	tmp := writeTempFile(t, content)
	_, err := Parse(tmp)
	if err == nil {
		t.Fatal("expected error for empty pipeline")
	}
}

func TestDiscover(t *testing.T) {
	// Create temp adapters dir
	dir := t.TempDir()
	f1 := filepath.Join(dir, "test1.yaml")
	f2 := filepath.Join(dir, "test2.yaml")
	os.WriteFile(f1, []byte("site: a\nname: b\npipeline:\n  - fetch: x\n"), 0644)
	os.WriteFile(f2, []byte("site: c\nname: d\npipeline:\n  - fetch: y\n"), 0644)

	files, err := yamlFiles(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 files, got %d", len(files))
	}
}

func writeTempFile(t *testing.T, content string) string {
	t.Helper()
	tmp := filepath.Join(t.TempDir(), "adapter.yaml")
	if err := os.WriteFile(tmp, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write temp file: %v", err)
	}
	return tmp
}
```

- [ ] **Step 4: Run tests**

Run:
```bash
cd cli && go test ./internal/adapter/... -v
```

Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add cli/internal/adapter/
git commit -m "feat(cli): add adapter types, YAML parser, and discovery"
```

---

### Task 3: Expression Template Engine

**Files:**
- Create: `cli/internal/pipeline/template.go`

- [ ] **Step 1: Write failing test for template engine**

Create `cli/internal/pipeline/template_test.go`:

```go
package pipeline

import (
	"testing"
)

func TestResolveSimpleVariable(t *testing.T) {
	ctx := &PipelineContext{
		Args: map[string]any{"limit": 10},
		Items: []any{map[string]any{"title": "hello"}},
	}
	env := ctx.ExprEnv(0) // index 0, first item

	result, err := Resolve("${{ item.title }}", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "hello" {
		t.Errorf("expected 'hello', got %v", result)
	}
}

func TestResolveMathExpression(t *testing.T) {
	ctx := &PipelineContext{
		Args: map[string]any{"limit": 20},
	}
	env := ctx.ExprEnv(0)

	result, err := Resolve("${{ Math.min(args.limit, 50) }}", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != 20 {
		t.Errorf("expected 20, got %v", result)
	}
}

func TestResolveBooleanExpression(t *testing.T) {
	ctx := &PipelineContext{}
	env := ExprEnv{
		Item:  map[string]any{"score": 150, "dead": false},
		Index: 0,
		Args:  map[string]any{},
		Vars:  map[string]any{},
	}

	result, err := Resolve("${{ item.score > 100 && !item.dead }}", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != true {
		t.Errorf("expected true, got %v", result)
	}
}

func TestResolveNoTemplate(t *testing.T) {
	env := ExprEnv{Args: map[string]any{}}
	result, err := Resolve("plain text", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "plain text" {
		t.Errorf("expected 'plain text', got %v", result)
	}
}

func TestResolveIntValue(t *testing.T) {
	ctx := &PipelineContext{
		Args: map[string]any{"limit": 42},
	}
	env := ctx.ExprEnv(0)

	result, err := Resolve("${{ args.limit }}", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != 42 {
		t.Errorf("expected 42, got %v", result)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd cli && go test ./internal/pipeline/... -v
```

Expected: Compile error — `PipelineContext`, `ExprEnv`, `Resolve` not defined.

- [ ] **Step 3: Implement template engine**

Create `cli/internal/pipeline/template.go`:

```go
package pipeline

import (
	"fmt"
	"math"
	"regexp"
	"strings"

	"github.com/expr-lang/expr"
)

// ExprEnv is the expression evaluation environment.
type ExprEnv struct {
	Item  any            `json:"item"`
	Index int            `json:"index"`
	Args  map[string]any `json:"args"`
	Vars  map[string]any `json:"vars"`
}

// Math exposes common math functions to expr.
var Math = map[string]any{
	"min": math.Min,
	"max": math.Max,
	"abs": math.Abs,
	"ceil": math.Ceil,
	"floor": math.Floor,
	"round": func(f float64) float64 { return math.Round(f) },
}

var templateRe = regexp.MustCompile(`\$\{\{(.+?)\}\}`)

// Resolve evaluates a ${{ }} expression and returns the result.
// If the input contains no template markers, it is returned as-is.
func Resolve(input string, env ExprEnv) (any, error) {
	if !strings.Contains(input, "${{") {
		return input, nil
	}

	// If the entire input is a single ${{ }} expression, return the raw result
	matches := templateRe.FindAllStringSubmatch(input, -1)
	if len(matches) == 1 && input == matches[0][0] {
		return evalExpr(strings.TrimSpace(matches[0][1]), env)
	}

	// Otherwise, do string replacement
	result := templateRe.ReplaceAllStringFunc(input, func(match string) string {
		exprStr := strings.TrimSpace(match[3 : len(match)-3]) // strip ${{ }}
		val, err := evalExpr(exprStr, env)
		if err != nil {
			return match // leave unresolved
		}
		return fmt.Sprintf("%v", val)
	})

	return result, nil
}

func evalExpr(expression string, env ExprEnv) (any, error) {
	options := []expr.Option{
		expr.Env(env),
		expr.AllowUndefinedVariables(),
		expr.Function("Math.min", func(args ...any) (any, error) {
			return Math["min"], nil
		}),
	}

	program, err := expr.Compile(expression, options...)
	if err != nil {
		return nil, fmt.Errorf("compile expr %q: %w", expression, err)
	}

	result, err := expr.Run(program, env)
	if err != nil {
		return nil, fmt.Errorf("eval expr %q: %w", expression, err)
	}

	return result, nil
}
```

- [ ] **Step 4: Fix Math.min to work as a function**

The initial implementation above has a bug — `expr` needs Math.min registered as a callable function. Let me fix the implementation properly:

```go
package pipeline

import (
	"fmt"
	"math"
	"regexp"
	"strings"

	"github.com/expr-lang/expr"
)

// ExprEnv is the expression evaluation environment.
type ExprEnv struct {
	Item  any            `json:"item"`
	Index int            `json:"index"`
	Args  map[string]any `json:"args"`
	Vars  map[string]any `json:"vars"`
}

// MathFuncs exposes math functions callable from expressions.
var MathFuncs = map[string]any{
	"min":   math.Min,
	"max":   math.Max,
	"abs":   math.Abs,
	"ceil":  math.Ceil,
	"floor": math.Floor,
	"round": func(f float64) float64 { return math.Round(f) },
}

var templateRe = regexp.MustCompile(`\$\{\{(.+?)\}\}`)

// Resolve evaluates a ${{ }} expression and returns the result.
// If the input contains no template markers, it is returned as-is.
func Resolve(input string, env ExprEnv) (any, error) {
	if !strings.Contains(input, "${{") {
		return input, nil
	}

	// If the entire input is a single ${{ }} expression, return the raw result
	matches := templateRe.FindAllStringSubmatch(input, -1)
	if len(matches) == 1 && input == matches[0][0] {
		return evalExpr(strings.TrimSpace(matches[0][1]), env)
	}

	// Otherwise, do string replacement
	result := templateRe.ReplaceAllStringFunc(input, func(match string) string {
		exprStr := strings.TrimSpace(match[3 : len(match)-3])
		val, err := evalExpr(exprStr, env)
		if err != nil {
			return match
		}
		return fmt.Sprintf("%v", val)
	})

	return result, nil
}

func evalExpr(expression string, env ExprEnv) (any, error) {
	// Build the environment with Math functions
	fullEnv := map[string]any{
		"item":  env.Item,
		"index": env.Index,
		"args":  env.Args,
		"vars":  env.Vars,
		"Math":  MathFuncs,
	}

	program, err := expr.Compile(expression, expr.Env(fullEnv), expr.AllowUndefinedVariables())
	if err != nil {
		return nil, fmt.Errorf("compile expr %q: %w", expression, err)
	}

	result, err := expr.Run(program, fullEnv)
	if err != nil {
		return nil, fmt.Errorf("eval expr %q: %w", expression, err)
	}

	return result, nil
}
```

- [ ] **Step 5: Add ExprEnv method to PipelineContext (forward reference)**

We need a placeholder `PipelineContext` type for the tests. Add to `template.go`:

```go
// PipelineContext holds the execution state (defined fully in context.go).
// This forward declaration is here to avoid circular imports.
type PipelineContext struct {
	Args  map[string]any
	Items []any
	Vars  map[string]any
}

func (c *PipelineContext) ExprEnv(index int) ExprEnv {
	var item any
	if index < len(c.Items) {
		item = c.Items[index]
	}
	return ExprEnv{
		Item:  item,
		Index: index,
		Args:  c.Args,
		Vars:  c.Vars,
	}
}
```

- [ ] **Step 6: Run tests**

Run:
```bash
cd cli && go test ./internal/pipeline/... -v
```

Expected: All 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add cli/internal/pipeline/template.go cli/internal/pipeline/template_test.go
git commit -m "feat(cli): add ${{ }} expression engine with expr-lang/expr"
```

---

### Task 4: Pipeline Context and Engine

**Files:**
- Create: `cli/internal/pipeline/context.go` (move PipelineContext here from template.go)
- Create: `cli/internal/pipeline/engine.go`

- [ ] **Step 1: Move PipelineContext to context.go**

Create `cli/internal/pipeline/context.go`:

```go
package pipeline

// PipelineContext holds the execution state for a pipeline run.
type PipelineContext struct {
	Args  map[string]any // User-provided arguments (from CLI flags)
	Items []any          // Current data items flowing through steps
	Vars  map[string]any // Pipeline-scoped variables (set by steps)
}

// NewContext creates a new PipelineContext with defaults.
func NewContext(args map[string]any) *PipelineContext {
	return &PipelineContext{
		Args:  args,
		Items: []any{},
		Vars:  make(map[string]any),
	}
}

// ExprEnv returns the expression evaluation environment for a given item index.
func (c *PipelineContext) ExprEnv(index int) ExprEnv {
	var item any
	if index < len(c.Items) {
		item = c.Items[index]
	}
	return ExprEnv{
		Item:  item,
		Index: index,
		Args:  c.Args,
		Vars:  c.Vars,
	}
}
```

- [ ] **Step 2: Remove PipelineContext from template.go**

Edit `cli/internal/pipeline/template.go` — remove the `PipelineContext` struct and `ExprEnv` method. Keep only `ExprEnv`, `Resolve`, `evalExpr`, `MathFuncs`, and `templateRe`.

- [ ] **Step 3: Write engine with failing test**

Create `cli/internal/pipeline/engine_test.go`:

```go
package pipeline

import (
	"testing"
)

func TestEngineDataSteps(t *testing.T) {
	ctx := NewContext(map[string]any{"limit": 2})
	ctx.Items = []any{
		map[string]any{"title": "a", "score": 10},
		map[string]any{"title": "b", "score": 20},
		map[string]any{"title": "c", "score": 30},
	}

	// Simple limit step
	step := map[string]any{"limit": 2}
	items, err := ExecuteStep(ctx, "limit", step, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 2 {
		t.Errorf("expected 2 items, got %d", len(items))
	}
}

func TestEngineFilterStep(t *testing.T) {
	ctx := NewContext(map[string]any{})
	ctx.Items = []any{
		map[string]any{"score": 50},
		map[string]any{"score": 150},
		map[string]any{"score": 200},
	}

	step := map[string]any{"filter": "item.score > 100"}
	items, err := ExecuteStep(ctx, "filter", step, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 2 {
		t.Errorf("expected 2 items, got %d", len(items))
	}
}
```

- [ ] **Step 4: Run test to verify it fails**

Run:
```bash
cd cli && go test ./internal/pipeline/... -v
```

Expected: Compile error — `ExecuteStep` not defined.

- [ ] **Step 5: Implement engine**

Create `cli/internal/pipeline/engine.go`:

```go
package pipeline

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/adapter"
)

// ExecuteStep dispatches a step to the appropriate handler.
// Returns the updated items list (for data steps) or nil (for browser steps).
func ExecuteStep(ctx *PipelineContext, stepName string, stepData map[string]any, bridge any) ([]any, error) {
	// Data steps
	switch stepName {
	case "limit":
		return execLimit(ctx, stepData)
	case "filter":
		return execFilter(ctx, stepData)
	case "map":
		return execMap(ctx, stepData)
	case "sort":
		return execSort(ctx, stepData)
	case "select":
		return execSelect(ctx, stepData)
	case "tap":
		return execTap(ctx, stepData)
	case "evaluate":
		return execEvaluate(ctx, stepData, bridge)
	case "fetch", "navigate", "click", "type", "wait", "intercept", "download":
		// Browser/mixed steps — delegated to caller with bridge
		return nil, fmt.Errorf("browser step %q requires bridge (not yet wired)", stepName)
	default:
		return nil, fmt.Errorf("unknown step type: %s", stepName)
	}
}

// RunPipeline executes a full pipeline from a parsed config.
func RunPipeline(ctx *PipelineContext, cfg *adapter.AdapterConfig, bridge any) ([]any, error) {
	var items []any

	for i, step := range cfg.Pipeline {
		stepName, stepData, err := stepToMap(step)
		if err != nil {
			return nil, fmt.Errorf("step %d: %w", i, err)
		}

		// For data steps, update items
		result, err := ExecuteStep(ctx, stepName, stepData, bridge)
		if err != nil {
			return nil, fmt.Errorf("step %d (%s): %w", i, stepName, err)
		}

		// Update context items for data steps
		if stepName == "map" || stepName == "filter" || stepName == "sort" ||
			stepName == "limit" || stepName == "select" || stepName == "evaluate" {
			ctx.Items = result
			items = result
		}
	}

	return items, nil
}

// stepToMap converts a Step struct to (name, data) pair.
func stepToMap(step adapter.Step) (string, map[string]any, error) {
	if step.Fetch != "" {
		return "fetch", map[string]any{"url": step.Fetch}, nil
	}
	if step.Navigate != "" {
		return "navigate", map[string]any{"url": step.Navigate}, nil
	}
	if step.Click != nil {
		switch v := step.Click.(type) {
		case string:
			return "click", map[string]any{"selector": v}, nil
		case map[string]any:
			return "click", v, nil
		}
		return "click", map[string]any{"selector": step.Click}, nil
	}
	if step.Type != nil {
		return "type", step.Type, nil
	}
	if step.Wait != nil {
		switch v := step.Wait.(type) {
		case string:
			return "wait", map[string]any{"selector": v}, nil
		case float64:
			return "wait", map[string]any{"timeout": int(v)}, nil
		case map[string]any:
			return "wait", v, nil
		}
		return "wait", map[string]any{"selector": step.Wait}, nil
	}
	if step.Intercept != "" {
		return "intercept", map[string]any{"urlPattern": step.Intercept}, nil
	}
	if step.Download != nil {
		switch v := step.Download.(type) {
		case string:
			return "download", map[string]any{"url": v}, nil
		default:
			return "download", map[string]any{"url": v}, nil
		}
	}
	if step.Map != nil {
		return "map", step.Map, nil
	}
	if step.Filter != nil {
		return "filter", map[string]any{"expr": step.Filter}, nil
	}
	if step.Sort != nil {
		return "sort", map[string]any{"expr": step.Sort}, nil
	}
	if step.Limit != nil {
		return "limit", map[string]any{"expr": step.Limit}, nil
	}
	if step.Select != nil {
		return "select", map[string]any{"fields": step.Select}, nil
	}
	if step.Evaluate != "" {
		return "evaluate", map[string]any{"expression": step.Evaluate}, nil
	}
	if step.Tap != nil && *step.Tap {
		return "tap", map[string]any{}, nil
	}

	return "", nil, fmt.Errorf("step has no action")
}
```

- [ ] **Step 6: Implement data step handlers**

Create `cli/internal/pipeline/steps/data/map.go`:

```go
package data

import (
	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline"
)

// ExecMap transforms each item using the expression map.
func ExecMap(ctx *pipeline.PipelineContext, stepData map[string]any) ([]any, error) {
	var results []any
	for i, item := range ctx.Items {
		env := ctx.ExprEnv(i)
		env.Item = item
		newItem := make(map[string]any)
		for key, val := range stepData {
			if str, ok := val.(string); ok {
				resolved, err := pipeline.Resolve(str, env)
				if err != nil {
					return nil, err
				}
				newItem[key] = resolved
			} else {
				newItem[key] = val
			}
		}
		results = append(results, newItem)
	}
	return results, nil
}
```

Create `cli/internal/pipeline/steps/data/filter.go`:

```go
package data

import (
	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline"
)

// ExecFilter keeps items matching the expression.
func ExecFilter(ctx *pipeline.PipelineContext, stepData map[string]any) ([]any, error) {
	exprVal, ok := stepData["expr"]
	if !ok {
		return ctx.Items, nil
	}

	var results []any
	for i, item := range ctx.Items {
		env := ctx.ExprEnv(i)
		env.Item = item
		exprStr, ok := exprVal.(string)
		if !ok {
			// Non-string: treat as literal bool
			if b, ok := exprVal.(bool); ok && b {
				results = append(results, item)
			}
			continue
		}
		res, err := pipeline.Resolve(exprStr, env)
		if err != nil {
			return nil, err
		}
		if b, ok := res.(bool); ok && b {
			results = append(results, item)
		}
	}
	return results, nil
}
```

Create `cli/internal/pipeline/steps/data/limit.go`:

```go
package data

import (
	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline"
)

// ExecLimit truncates items to N items.
func ExecLimit(ctx *pipeline.PipelineContext, stepData map[string]any) ([]any, error) {
	exprVal := stepData["expr"]

	// Resolve expression if string
	var n int
	switch v := exprVal.(type) {
	case int:
		n = v
	case float64:
		n = int(v)
	case string:
		env := ctx.ExprEnv(0)
		resolved, err := pipeline.Resolve(v, env)
		if err != nil {
			return nil, err
		}
		switch rv := resolved.(type) {
		case int:
			n = rv
		case float64:
			n = int(rv)
		default:
			return nil, nil
		}
	default:
		return ctx.Items, nil
	}

	if n < 0 || n > len(ctx.Items) {
		n = len(ctx.Items)
	}
	return ctx.Items[:n], nil
}
```

Create `cli/internal/pipeline/steps/data/sort.go`:

```go
package data

import (
	"sort"

	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline"
)

// ExecSort sorts items by expression value.
func ExecSort(ctx *pipeline.PipelineContext, stepData map[string]any) ([]any, error) {
	exprVal, ok := stepData["expr"]
	if !ok {
		return ctx.Items, nil
	}

	exprStr, ok := exprVal.(string)
	if !ok {
		return ctx.Items, nil
	}

	results := make([]any, len(ctx.Items))
	copy(results, ctx.Items)

	sort.Slice(results, func(i, j int) bool {
		envI := ctx.ExprEnv(i)
		envI.Item = results[i]
		envJ := ctx.ExprEnv(j)
		envJ.Item = results[j]

		valI, _ := pipeline.Resolve(exprStr, envI)
		valJ, _ := pipeline.Resolve(exprStr, envJ)

		return compare(valI) < compare(valJ)
	})

	return results, nil
}

func compare(v any) float64 {
	switch val := v.(type) {
	case int:
		return float64(val)
	case float64:
		return val
	case string:
		return 0 // strings sort last (simplified)
	default:
		return 0
	}
}
```

Create `cli/internal/pipeline/steps/data/select.go`:

```go
package data

import (
	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline"
)

// ExecSelect picks specific fields from each item.
func ExecSelect(ctx *pipeline.PipelineContext, stepData map[string]any) ([]any, error) {
	fieldsVal, ok := stepData["fields"]
	if !ok {
		return ctx.Items, nil
	}

	var fields []string
	switch v := fieldsVal.(type) {
	case []any:
		for _, f := range v {
			if s, ok := f.(string); ok {
				fields = append(fields, s)
			}
		}
	case []string:
		fields = v
	default:
		return ctx.Items, nil
	}

	var results []any
	for _, item := range ctx.Items {
		if m, ok := item.(map[string]any); ok {
			newItem := make(map[string]any)
			for _, f := range fields {
				if val, exists := m[f]; exists {
					newItem[f] = val
				}
			}
			results = append(results, newItem)
		}
	}
	return results, nil
}
```

Create `cli/internal/pipeline/steps/data/tap.go`:

```go
package data

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline"
)

// ExecTap prints items for debugging and passes them through.
func ExecTap(ctx *pipeline.PipelineContext, stepData map[string]any) ([]any, error) {
	fmt.Printf("--- TAP: %d items ---\n", len(ctx.Items))
	for i, item := range ctx.Items {
		fmt.Printf("  [%d] %+v\n", i, item)
	}
	fmt.Println("--- END TAP ---")
	return ctx.Items, nil
}
```

Create `cli/internal/pipeline/steps/data/evaluate.go`:

```go
package data

import (
	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline"
)

// ExecEvaluate runs JS via the extension bridge.
// Placeholder: returns items unchanged (bridge wiring in Task 6).
func ExecEvaluate(ctx *pipeline.PipelineContext, stepData map[string]any, bridge any) ([]any, error) {
	// TODO: wire up to bridge in Task 6
	// For now, pass through unchanged
	return ctx.Items, nil
}
```

- [ ] **Step 7: Wire data steps into engine**

Edit `cli/internal/pipeline/engine.go` — import the data packages and wire:

```go
import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/adapter"
	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline/steps/data"
)
```

Update `ExecuteStep` switch:

```go
	switch stepName {
	case "limit":
		return data.ExecLimit(ctx, stepData)
	case "filter":
		return data.ExecFilter(ctx, stepData)
	case "map":
		return data.ExecMap(ctx, stepData)
	case "sort":
		return data.ExecSort(ctx, stepData)
	case "select":
		return data.ExecSelect(ctx, stepData)
	case "tap":
		return data.ExecTap(ctx, stepData)
	case "evaluate":
		return data.ExecEvaluate(ctx, stepData, bridge)
	case "fetch", "navigate", "click", "type", "wait", "intercept", "download":
		return nil, fmt.Errorf("browser step %q requires bridge (not yet wired)", stepName)
	default:
		return nil, fmt.Errorf("unknown step type: %s", stepName)
	}
```

- [ ] **Step 8: Run tests**

Run:
```bash
cd cli && go test ./internal/pipeline/... -v
```

Expected: All 7 tests pass (5 from template + 2 from engine).

- [ ] **Step 9: Commit**

```bash
git add cli/internal/pipeline/
git commit -m "feat(cli): add pipeline engine with data step handlers"
```

---

### Task 5: WebSocket Bridge

**Files:**
- Create: `cli/internal/bridge/client.go`
- Create: `cli/internal/bridge/action.go`

- [ ] **Step 1: Write failing test for bridge client**

Create `cli/internal/bridge/client_test.go`:

```go
package bridge

import (
	"testing"
	"time"
)

func TestBridgeRequestResponse(t *testing.T) {
	// This is a connection test — if extension is not running, it should error
	client := NewClient("ws://localhost:3026", 5*time.Second)
	err := client.Connect()
	if err != nil {
		t.Skip("extension not running, skipping integration test")
	}
	defer client.Close()

	resp, err := client.Send("get_tabs", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.Success {
		t.Errorf("expected success, got: %v", resp.Error)
	}
}

func TestBridgeConnectionFails(t *testing.T) {
	client := NewClient("ws://localhost:9999", 2*time.Second)
	err := client.Connect()
	if err == nil {
		t.Fatal("expected connection error")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd cli && go test ./internal/bridge/... -v
```

Expected: Compile error — `NewClient`, `Client` not defined.

- [ ] **Step 3: Implement bridge client**

Create `cli/internal/bridge/client.go`:

```go
package bridge

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// BridgeRequest is the wire format sent to the extension.
type BridgeRequest struct {
	Type   string         `json:"type"`
	ID     string         `json:"id"`
	Action string         `json:"action"`
	Params map[string]any `json:"params"`
}

// BridgeResponse is the wire format received from the extension.
type BridgeResponse struct {
	Type    string        `json:"type"`
	ID      string        `json:"id"`
	Payload BridgePayload `json:"payload"`
}

// BridgePayload is the inner response payload.
type BridgePayload struct {
	Success bool   `json:"success"`
	Data    any    `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
}

// Client manages a WebSocket connection to the extension.
type Client struct {
	url     string
	timeout time.Duration
	conn    *websocket.Conn
	mu      sync.Mutex
	pending map[string]chan BridgeResponse
}

// NewClient creates a new bridge client.
func NewClient(url string, timeout time.Duration) *Client {
	return &Client{
		url:     url,
		timeout: timeout,
		pending: make(map[string]chan BridgeResponse),
	}
}

// Connect establishes the WebSocket connection.
func (c *Client) Connect() error {
	conn, _, err := websocket.DefaultDialer.Dial(c.url, nil)
	if err != nil {
		return fmt.Errorf("connect to %s: %w", c.url, err)
	}
	c.conn = conn

	// Start read loop
	go c.readLoop()

	return nil
}

// Close closes the WebSocket connection.
func (c *Client) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// Send sends a request and waits for the matching response.
func (c *Client) Send(action string, params map[string]any) (*BridgePayload, error) {
	id := fmt.Sprintf("req_%d", time.Now().UnixNano())

	// Create response channel
	respCh := make(chan BridgeResponse, 1)
	c.mu.Lock()
	c.pending[id] = respCh
	c.mu.Unlock()

	// Send request
	req := BridgeRequest{
		Type:   "REQUEST",
		ID:     id,
		Action: action,
		Params: params,
	}

	if err := c.conn.WriteJSON(req); err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}

	// Wait for response
	select {
	case resp := <-respCh:
		return &resp.Payload, nil
	case <-time.After(c.timeout):
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, fmt.Errorf("timeout waiting for response (action=%s, timeout=%s)", action, c.timeout)
	}
}

// readLoop reads messages from the WebSocket connection.
func (c *Client) readLoop() {
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			// Connection closed — drain pending
			c.mu.Lock()
			for _, ch := range c.pending {
				select {
				case ch <- BridgeResponse{Payload: BridgePayload{Success: false, Error: "connection closed"}}:
				default:
				}
			}
			c.mu.Unlock()
			return
		}

		var resp BridgeResponse
		if err := json.Unmarshal(msg, &resp); err != nil {
			continue // skip malformed messages
		}

		// Route to pending request
		c.mu.Lock()
		if ch, ok := c.pending[resp.ID]; ok {
			delete(c.pending, resp.ID)
			select {
			case ch <- resp:
			default:
			}
		}
		c.mu.Unlock()
	}
}
```

- [ ] **Step 4: Implement action mapper**

Create `cli/internal/bridge/action.go`:

```go
package bridge

// ActionMap maps pipeline step names to extension action names.
var ActionMap = map[string]string{
	"navigate":  "navigate",
	"click":     "click",
	"type":      "type",
	"wait":      "wait_for_selector", // default, overridden by params
	"evaluate":  "evaluate",
	"intercept": "enable_network",
	"download":  "download",
}

// MapAction returns the extension action name for a pipeline step.
func MapAction(stepName string) string {
	if action, ok := ActionMap[stepName]; ok {
		return action
	}
	return stepName
}

// BuildParams builds params for a given action and step data.
func BuildParams(action string, stepData map[string]any) map[string]any {
	params := make(map[string]any)
	for k, v := range stepData {
		params[k] = v
	}

	// Special handling for wait step
	if action == "wait_for_selector" {
		if _, hasTimeout := params["timeout"]; !hasTimeout {
			params["visible"] = true
		}
	}

	return params
}
```

- [ ] **Step 5: Run tests**

Run:
```bash
cd cli && go test ./internal/bridge/... -v
```

Expected: Test `TestBridgeConnectionFails` passes, `TestBridgeRequestResponse` skips (no extension).

- [ ] **Step 6: Commit**

```bash
git add cli/internal/bridge/
git commit -m "feat(cli): add WebSocket bridge client and action mapper"
```

---

### Task 6: Wire Browser Steps to Engine

**Files:**
- Modify: `cli/internal/pipeline/engine.go` — add browser step handling
- Create: `cli/internal/pipeline/steps/browser/navigate.go`
- Create: `cli/internal/pipeline/steps/browser/click.go`
- Create: `cli/internal/pipeline/steps/browser/type.go`
- Create: `cli/internal/pipeline/steps/browser/wait.go`
- Create: `cli/internal/pipeline/steps/browser/intercept.go`
- Create: `cli/internal/pipeline/steps/browser/download.go`
- Create: `cli/internal/pipeline/steps/browser/fetch.go`

- [ ] **Step 1: Implement browser step handlers**

Create `cli/internal/pipeline/steps/browser/navigate.go`:

```go
package browser

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecNavigate sends a navigate action to the extension.
func ExecNavigate(stepData map[string]any, client *bridge.Client) error {
	url, ok := stepData["url"].(string)
	if !ok {
		return fmt.Errorf("navigate requires url")
	}
	payload, err := client.Send("navigate", map[string]any{"url": url})
	if err != nil {
		return fmt.Errorf("navigate: %w", err)
	}
	if !payload.Success {
		return fmt.Errorf("navigate failed: %s", payload.Error)
	}
	return nil
}
```

Create `cli/internal/pipeline/steps/browser/click.go`:

```go
package browser

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecClick sends a click action to the extension.
func ExecClick(stepData map[string]any, client *bridge.Client) error {
	params := make(map[string]any)
	if selector, ok := stepData["selector"].(string); ok {
		params["selector"] = selector
	}
	if index, ok := stepData["index"].(int); ok {
		params["index"] = index
	}
	if len(params) == 0 {
		return fmt.Errorf("click requires selector or index")
	}

	payload, err := client.Send("click", params)
	if err != nil {
		return fmt.Errorf("click: %w", err)
	}
	if !payload.Success {
		return fmt.Errorf("click failed: %s", payload.Error)
	}
	return nil
}
```

Create `cli/internal/pipeline/steps/browser/type.go`:

```go
package browser

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecType sends a type action to the extension.
func ExecType(stepData map[string]any, client *bridge.Client) error {
	selector, _ := stepData["selector"].(string)
	text, _ := stepData["text"].(string)
	if text == "" {
		return fmt.Errorf("type requires text")
	}
	params := map[string]any{"text": text}
	if selector != "" {
		params["selector"] = selector
	}

	payload, err := client.Send("type", params)
	if err != nil {
		return fmt.Errorf("type: %w", err)
	}
	if !payload.Success {
		return fmt.Errorf("type failed: %s", payload.Error)
	}
	return nil
}
```

Create `cli/internal/pipeline/steps/browser/wait.go`:

```go
package browser

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecWait sends a wait action to the extension.
func ExecWait(stepData map[string]any, client *bridge.Client) error {
	if selector, ok := stepData["selector"].(string); ok {
		// Wait for selector
		params := map[string]any{"selector": selector, "visible": true}
		if timeout, ok := stepData["timeout"]; ok {
			params["timeout"] = timeout
		}
		payload, err := client.Send("wait_for_selector", params)
		if err != nil {
			return fmt.Errorf("wait_for_selector: %w", err)
		}
		if !payload.Success {
			return fmt.Errorf("wait_for_selector failed: %s", payload.Error)
		}
		return nil
	}

	if timeout, ok := stepData["timeout"]; ok {
		// Wait for timeout
		var ms int
		switch v := timeout.(type) {
		case int:
			ms = v
		case float64:
			ms = int(v)
		default:
			return fmt.Errorf("wait timeout must be a number")
		}
		payload, err := client.Send("wait_for_timeout", map[string]any{"ms": ms})
		if err != nil {
			return fmt.Errorf("wait_for_timeout: %w", err)
		}
		if !payload.Success {
			return fmt.Errorf("wait_for_timeout failed: %s", payload.Error)
		}
		return nil
	}

	return fmt.Errorf("wait requires selector or timeout")
}
```

Create `cli/internal/pipeline/steps/browser/intercept.go`:

```go
package browser

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecIntercept enables network capture and waits for a matching response.
func ExecIntercept(stepData map[string]any, client *bridge.Client) error {
	// Step 1: Enable network
	payload, err := client.Send("enable_network", nil)
	if err != nil {
		return fmt.Errorf("enable_network: %w", err)
	}
	if !payload.Success {
		return fmt.Errorf("enable_network failed: %s", payload.Error)
	}

	// Step 2: Wait for response
	urlPattern, ok := stepData["urlPattern"].(string)
	if !ok {
		return fmt.Errorf("intercept requires urlPattern")
	}
	params := map[string]any{"urlPattern": urlPattern}
	if method, ok := stepData["method"]; ok {
		params["method"] = method
	}
	if timeout, ok := stepData["timeout"]; ok {
		params["timeout"] = timeout
	}

	payload, err = client.Send("wait_for_response", params)
	if err != nil {
		return fmt.Errorf("wait_for_response: %w", err)
	}
	if !payload.Success {
		return fmt.Errorf("wait_for_response failed: %s", payload.Error)
	}
	return nil
}
```

Create `cli/internal/pipeline/steps/browser/download.go`:

```go
package browser

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecDownload sends a download action to the extension.
func ExecDownload(stepData map[string]any, client *bridge.Client) error {
	params := make(map[string]any)
	if url, ok := stepData["url"].(string); ok {
		params["url"] = url
	}
	if index, ok := stepData["index"].(int); ok {
		params["index"] = index
	}
	if len(params) == 0 {
		return fmt.Errorf("download requires url or index")
	}

	payload, err := client.Send("download", params)
	if err != nil {
		return fmt.Errorf("download: %w", err)
	}
	if !payload.Success {
		return fmt.Errorf("download failed: %s", payload.Error)
	}
	return nil
}
```

Create `cli/internal/pipeline/steps/browser/fetch.go`:

```go
package browser

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecFetch performs an HTTP request. For public strategy, uses Go net/http directly.
// For cookie strategy, gets cookies from extension first.
func ExecFetch(url string, strategy string, client *bridge.Client) ([]any, error) {
	var body []byte
	var err error

	switch strategy {
	case "public":
		body, err = httpGet(url)
	case "cookie":
		body, err = httpGetWithCookies(url, client)
	default:
		body, err = httpGet(url) // fallback to public
	}

	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", url, err)
	}

	// Try to parse as JSON array or object
	var result any
	if err := json.Unmarshal(body, &result); err != nil {
		// Not JSON — wrap in single-item list
		return []any{string(body)}, nil
	}

	// If it's an array, return it as items
	if arr, ok := result.([]any); ok {
		return arr, nil
	}

	// If it's an object, wrap in single-item list
	return []any{result}, nil
}

func httpGet(url string) ([]byte, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func httpGetWithCookies(url string, client *bridge.Client) ([]byte, error) {
	// Get cookies from extension
	payload, err := client.Send("get_cookies", nil)
	if err != nil {
		return nil, fmt.Errorf("get_cookies: %w", err)
	}
	if !payload.Success {
		return nil, fmt.Errorf("get_cookies failed: %s", payload.Error)
	}

	// Use cookies in HTTP request (simplified — full impl would parse cookies)
	return httpGet(url)
}
```

- [ ] **Step 2: Wire browser steps into engine**

Edit `cli/internal/pipeline/engine.go` — update `ExecuteStep` and `RunPipeline`:

Add to imports:
```go
import (
	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline/steps/browser"
	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline/steps/data"
)
```

Change `ExecuteStep` signature and switch:

```go
// ExecuteStep dispatches a step to the appropriate handler.
// bridgeClient is nil for data steps.
func ExecuteStep(ctx *PipelineContext, stepName string, stepData map[string]any, bridgeClient *bridge.Client) ([]any, error) {
	switch stepName {
	case "limit":
		return data.ExecLimit(ctx, stepData)
	case "filter":
		return data.ExecFilter(ctx, stepData)
	case "map":
		return data.ExecMap(ctx, stepData)
	case "sort":
		return data.ExecSort(ctx, stepData)
	case "select":
		return data.ExecSelect(ctx, stepData)
	case "tap":
		return data.ExecTap(ctx, stepData)
	case "evaluate":
		return data.ExecEvaluate(ctx, stepData, bridgeClient)
	case "fetch":
		url, _ := stepData["url"].(string)
		// Strategy is set on the config level, not per-step — pass as "public" default
		return browser.ExecFetch(url, "public", bridgeClient)
	case "navigate":
		if err := browser.ExecNavigate(stepData, bridgeClient); err != nil {
			return nil, err
		}
		return ctx.Items, nil
	case "click":
		if err := browser.ExecClick(stepData, bridgeClient); err != nil {
			return nil, err
		}
		return ctx.Items, nil
	case "type":
		if err := browser.ExecType(stepData, bridgeClient); err != nil {
			return nil, err
		}
		return ctx.Items, nil
	case "wait":
		if err := browser.ExecWait(stepData, bridgeClient); err != nil {
			return nil, err
		}
		return ctx.Items, nil
	case "intercept":
		if err := browser.ExecIntercept(stepData, bridgeClient); err != nil {
			return nil, err
		}
		return ctx.Items, nil
	case "download":
		if err := browser.ExecDownload(stepData, bridgeClient); err != nil {
			return nil, err
		}
		return ctx.Items, nil
	default:
		return nil, fmt.Errorf("unknown step type: %s", stepName)
	}
}
```

Update `RunPipeline`:

```go
func RunPipeline(ctx *PipelineContext, cfg *adapter.AdapterConfig, bridgeClient *bridge.Client) ([]any, error) {
	var items []any

	for i, step := range cfg.Pipeline {
		stepName, stepData, err := stepToMap(step)
		if err != nil {
			return nil, fmt.Errorf("step %d: %w", i, err)
		}

		result, err := ExecuteStep(ctx, stepName, stepData, bridgeClient)
		if err != nil {
			return nil, fmt.Errorf("step %d (%s): %w", i, stepName, err)
		}

		// Update context items for data steps and fetch
		if stepName == "map" || stepName == "filter" || stepName == "sort" ||
			stepName == "limit" || stepName == "select" || stepName == "evaluate" ||
			stepName == "fetch" {
			ctx.Items = result
			items = result
		}
	}

	return items, nil
}
```

- [ ] **Step 3: Update evaluate to use bridge**

Edit `cli/internal/pipeline/steps/data/evaluate.go`:

```go
package data

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline"
)

// ExecEvaluate runs JS via the extension bridge.
func ExecEvaluate(ctx *pipeline.PipelineContext, stepData map[string]any, bridgeClient *bridge.Client) ([]any, error) {
	if bridgeClient == nil {
		return ctx.Items, nil
	}

	expr, ok := stepData["expression"].(string)
	if !ok {
		return ctx.Items, nil
	}

	// For each item, evaluate JS expression
	var results []any
	for _, item := range ctx.Items {
		// In a real implementation, this would inject item data into the page
		// For now, pass through
		_ = expr
		results = append(results, item)
	}
	return results, nil
}
```

- [ ] **Step 4: Verify build**

Run:
```bash
cd cli && go build ./...
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add cli/internal/pipeline/steps/browser/ cli/internal/pipeline/engine.go
git commit -m "feat(cli): wire browser steps to WebSocket bridge"
```

---

### Task 7: Output Formatters

**Files:**
- Create: `cli/internal/output/table.go`
- Create: `cli/internal/output/json.go`
- Create: `cli/internal/output/csv.go`

- [ ] **Step 1: Implement JSON output**

Create `cli/internal/output/json.go`:

```go
package output

import (
	"encoding/json"
	"fmt"
	"os"
)

// JSON prints items as JSON.
func JSON(items []any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(items)
}
```

- [ ] **Step 2: Implement CSV output**

Create `cli/internal/output/csv.go`:

```go
package output

import (
	"encoding/csv"
	"fmt"
	"os"
)

// CSV prints items as CSV.
func CSV(items []any, columns []string) error {
	if len(items) == 0 {
		return nil
	}

	// Auto-detect columns if not provided
	if len(columns) == 0 {
		if m, ok := items[0].(map[string]any); ok {
			for k := range m {
				columns = append(columns, k)
			}
		}
	}

	w := csv.NewWriter(os.Stdout)
	defer w.Flush()

	// Header
	if err := w.Write(columns); err != nil {
		return fmt.Errorf("write csv header: %w", err)
	}

	// Rows
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			w.Write([]string{fmt.Sprintf("%v", item)})
			continue
		}
		var row []string
		for _, col := range columns {
			row = append(row, fmt.Sprintf("%v", m[col]))
		}
		if err := w.Write(row); err != nil {
			return fmt.Errorf("write csv row: %w", err)
		}
	}

	return nil
}
```

- [ ] **Step 3: Implement table output**

Create `cli/internal/output/table.go`:

```go
package output

import (
	"fmt"
	"os"

	"github.com/jedib0t/go-pretty/v6/table"
	"github.com/jedib0t/go-pretty/v6/text"
)

// Table prints items as a formatted table.
func Table(items []any, columns []string) error {
	if len(items) == 0 {
		fmt.Println("No items found.")
		return nil
	}

	// Auto-detect columns if not provided
	if len(columns) == 0 {
		if m, ok := items[0].(map[string]any); ok {
			for k := range m {
				columns = append(columns, k)
			}
		}
	}

	t := table.NewWriter()
	t.SetStyle(table.StyleRounded)
	t.SetOutputMirror(os.Stdout)

	// Header
	header := table.Row{}
	for _, col := range columns {
		header = append(header, col)
	}
	t.AppendHeader(header)

	// Rows
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			t.AppendRow(table.Row{fmt.Sprintf("%v", item)})
			continue
		}
		row := table.Row{}
		for _, col := range columns {
			row = append(row, m[col])
		}
		t.AppendRow(row)
	}

	t.SetColumnConfigs([]table.ColumnConfig{
		{Number: 1, Align: text.AlignCenter},
	})

	t.Render()
	return nil
}
```

- [ ] **Step 4: Add output dispatcher**

Create `cli/internal/output/output.go`:

```go
package output

import (
	"fmt"
)

// Render outputs items in the specified format.
func Render(items []any, columns []string, format string) error {
	switch format {
	case "json":
		return JSON(items)
	case "csv":
		return CSV(items, columns)
	case "table", "":
		return Table(items, columns)
	default:
		return fmt.Errorf("unknown output format: %s", format)
	}
}
```

- [ ] **Step 5: Verify build**

Run:
```bash
cd cli && go build ./...
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add cli/internal/output/
git commit -m "feat(cli): add table/json/csv output formatters"
```

---

### Task 8: CLI Commands (run, list, show, validate, doctor)

**Files:**
- Create: `cli/cmd/run.go`
- Create: `cli/cmd/list.go`
- Create: `cli/cmd/show.go`
- Create: `cli/cmd/validate.go`
- Create: `cli/cmd/doctor.go`

- [ ] **Step 1: Create run command**

Create `cli/cmd/run.go`:

```go
package cmd

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/agents-cc/browser-agent-extension/cli/internal/adapter"
	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
	"github.com/agents-cc/browser-agent-extension/cli/internal/output"
	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline"
)

var (
	outputFormat string
	stepTimeout  time.Duration
)

var runCmd = &cobra.Command{
	Use:   "run <adapter.yaml>",
	Short: "Execute an adapter pipeline",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := adapter.Parse(args[0])
		if err != nil {
			return fmt.Errorf("parse adapter: %w", err)
		}

		// Connect to extension
		wsURL := "ws://localhost:3026/ws"
		client := bridge.NewClient(wsURL, stepTimeout)
		if err := client.Connect(); err != nil {
			return fmt.Errorf("connect to extension: %w\nHint: make sure the Chrome extension is running", err)
		}
		defer client.Close()

		// Build args from flags
		pArgs := make(map[string]any)
		// TODO: parse --limit, --keyword etc. dynamically from cfg.Args

		ctx := pipeline.NewContext(pArgs)
		items, err := pipeline.RunPipeline(ctx, cfg, client)
		if err != nil {
			return fmt.Errorf("pipeline: %w", err)
		}

		return output.Render(items, cfg.Columns, outputFormat)
	},
}

func init() {
	runCmd.Flags().StringVarP(&outputFormat, "output", "o", "table", "Output format (table|json|csv)")
	runCmd.Flags().DurationVar(&stepTimeout, "timeout", 30*time.Second, "Per-step timeout")
}

func init() {
	rootCmd.AddCommand(runCmd)
}
```

- [ ] **Step 2: Create list command**

Create `cli/cmd/list.go`:

```go
package cmd

import (
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"github.com/agents-cc/browser-agent-extension/cli/internal/adapter"
)

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List available adapters",
	RunE: func(cmd *cobra.Command, args []string) error {
		files, err := adapter.Discover()
		if err != nil {
			fmt.Println("No adapters found. Place *.yaml files in adapters/ or ~/.bae/adapters/")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "FILE\tSITE\tNAME\tDESCRIPTION")
		for _, f := range files {
			cfg, err := adapter.Parse(f)
			if err != nil {
				fmt.Fprintf(w, "%s\t(error)\t\t%s\n", f, err)
				continue
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", f, cfg.Site, cfg.Name, cfg.Description)
		}
		return w.Flush()
	},
}

func init() {
	rootCmd.AddCommand(listCmd)
}
```

- [ ] **Step 3: Create show command**

Create `cli/cmd/show.go`:

```go
package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/agents-cc/browser-agent-extension/cli/internal/adapter"
)

var showCmd = &cobra.Command{
	Use:   "show <adapter.yaml>",
	Short: "Show adapter details",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := adapter.Parse(args[0])
		if err != nil {
			return fmt.Errorf("parse adapter: %w", err)
		}

		fmt.Printf("Site:        %s\n", cfg.Site)
		fmt.Printf("Name:        %s\n", cfg.Name)
		fmt.Printf("Description: %s\n", cfg.Description)
		fmt.Printf("Strategy:    %s\n", cfg.Strategy)
		fmt.Printf("Steps:       %d\n", len(cfg.Pipeline))
		if len(cfg.Columns) > 0 {
			fmt.Printf("Columns:     %v\n", cfg.Columns)
		}
		if len(cfg.Args) > 0 {
			fmt.Println("Arguments:")
			for name, arg := range cfg.Args {
				fmt.Printf("  %-15s type=%s default=%v  %s\n", name, arg.Type, arg.Default, arg.Description)
			}
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(showCmd)
}
```

- [ ] **Step 4: Create validate command**

Create `cli/cmd/validate.go`:

```go
package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/agents-cc/browser-agent-extension/cli/internal/adapter"
)

var validateCmd = &cobra.Command{
	Use:   "validate <adapter.yaml>",
	Short: "Validate adapter syntax",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		_, err := adapter.Parse(args[0])
		if err != nil {
			return fmt.Errorf("validation failed: %w", err)
		}
		fmt.Println("✓ Adapter is valid")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(validateCmd)
}
```

- [ ] **Step 5: Create doctor command**

Create `cli/cmd/doctor.go`:

```go
package cmd

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Check extension connection",
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("Checking extension connection...")

		client := bridge.NewClient("ws://localhost:3026/ws", 5*time.Second)
		if err := client.Connect(); err != nil {
			fmt.Println("✗ Cannot connect to extension")
			fmt.Println("  Make sure:")
			fmt.Println("  1. Chrome extension is installed")
			fmt.Println("  2. Side panel is open")
			fmt.Println("  3. WebSocket server is running on port 3026")
			return err
		}
		defer client.Close()

		// Test with get_tabs
		payload, err := client.Send("get_tabs", nil)
		if err != nil {
			fmt.Printf("✗ Connected but get_tabs failed: %v\n", err)
			return err
		}

		fmt.Println("✓ Connected to extension")
		if payload.Success {
			fmt.Printf("✓ get_tabs OK (data: %v)\n", payload.Data)
		}

		return nil
	},
}

func init() {
	rootCmd.AddCommand(doctorCmd)
}
```

- [ ] **Step 6: Fix rootCmd import cycle**

The `cmd/` package needs to reference `rootCmd` from `main.go`. Let's restructure:

Edit `cli/main.go` to move the rootCmd into `cmd/root.go`:

Create `cli/cmd/root.go`:

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	version = "dev"
	verbose bool
)

// RootCmd is the root cobra command.
func RootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:   "bae",
		Short: "Browser Agent Extension CLI — YAML-driven pipeline engine for web data extraction",
		Long: `bae executes YAML-defined pipelines to extract structured data from websites,
powered by the Browser Agent Extension as the browser backend.`,
		SilenceUsage: true,
	}

	root.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Verbose logging")

	// Register subcommands
	root.AddCommand(runCmd)
	root.AddCommand(listCmd)
	root.AddCommand(showCmd)
	root.AddCommand(validateCmd)
	root.AddCommand(doctorCmd)

	return root
}

// Execute runs the CLI.
func Execute() {
	if err := RootCmd().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
```

Update `cli/main.go`:

```go
package main

import "github.com/agents-cc/browser-agent-extension/cli/cmd"

func main() {
	cmd.Execute()
}
```

- [ ] **Step 7: Fix forward references in cmd files**

Edit `cli/cmd/run.go` — change `rootCmd.AddCommand(runCmd)` at the bottom to just registering in `cmd/root.go`. Remove any `init()` that adds to `rootCmd` and instead add in `RootCmd()`.

Actually, a cleaner approach: use `init()` in each cmd file but import rootCmd from root.go. Let me restructure:

Edit `cli/cmd/root.go` — replace the `root.AddCommand(...)` lines with nothing. Each command will self-register via `init()`:

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	version = "dev"
	verbose bool
)

var rootCmd = &cobra.Command{
	Use:   "bae",
	Short: "Browser Agent Extension CLI — YAML-driven pipeline engine for web data extraction",
	Long: `bae executes YAML-defined pipelines to extract structured data from websites,
powered by the Browser Agent Extension as the browser backend.`,
	SilenceUsage: true,
}

// RootCmd returns the root command.
func GetRootCmd() *cobra.Command {
	return rootCmd
}

// Execute runs the CLI.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
```

Each subcommand file (`run.go`, `list.go`, `show.go`, `validate.go`, `doctor.go`) adds itself via `init()`:

```go
func init() {
	rootCmd.AddCommand(runCmd)
}
```

- [ ] **Step 8: Verify build**

Run:
```bash
cd cli && go build -o bin/bae .
```

Expected: Binary compiles successfully.

- [ ] **Step 9: Test all commands**

Run:
```bash
./cli/bin/bae --help
./cli/bin/bae list
./cli/bin/bae doctor
```

Expected: `--help` shows all commands, `list` shows adapters or "no adapters found", `doctor` shows connection status.

- [ ] **Step 10: Commit**

```bash
git add cli/cmd/ cli/main.go
git commit -m "feat(cli): add run, list, show, validate, doctor commands"
```

---

### Task 9: Add Sample Adapter and Integration Test

**Files:**
- Create: `adapters/hackernews/top.yaml`
- Modify: `.gitignore`

- [ ] **Step 1: Create sample adapter**

Create `adapters/hackernews/top.yaml`:

```yaml
site: hackernews
name: top
description: Hacker News top stories
strategy: public
browser: false

args:
  limit:
    type: int
    default: 10
    description: Number of stories

pipeline:
  - fetch: https://hacker-news.firebaseio.com/v0/topstories.json
  - limit: ${{ Math.min(args.limit + 5, 50) }}
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

- [ ] **Step 2: Update .gitignore**

Add to `.gitignore`:
```
# CLI binary
cli/bin/
```

- [ ] **Step 3: Validate the sample adapter**

Run:
```bash
./cli/bin/bae validate adapters/hackernews/top.yaml
```

Expected: `✓ Adapter is valid`

- [ ] **Step 4: Show the adapter details**

Run:
```bash
./cli/bin/bae show adapters/hackernews/top.yaml
```

Expected: Shows site, name, description, strategy, steps count, columns, and arguments.

- [ ] **Step 5: Commit**

```bash
git add adapters/ .gitignore
git commit -m "feat(cli): add sample Hacker News top stories adapter"
```

---

### Task 10: Update README and Run Full Build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add CLI section to README**

Add after the "Install the MCP Service" section in `README.md`:

```markdown
### 3. Build the CLI (optional)

```bash
cd cli
go build -o bin/bae .
./bin/bae --help
```

The CLI provides YAML-driven pipeline execution for web data extraction:

```bash
# Run an adapter
./bin/bae run adapters/hackernews/top.yaml --limit 10

# List available adapters
./bin/bae list

# Check extension connection
./bin/bae doctor
```
```

- [ ] **Step 2: Full build verification**

Run:
```bash
cd cli && go build ./... && go test ./... -v
```

Expected: All tests pass, no build errors.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add CLI section to README"
```

---

## Summary of Commits

1. `feat(cli): scaffold Go module and root command`
2. `feat(cli): add adapter types, YAML parser, and discovery`
3. `feat(cli): add ${{ }} expression engine with expr-lang/expr`
4. `feat(cli): add pipeline engine with data step handlers`
5. `feat(cli): add WebSocket bridge client and action mapper`
6. `feat(cli): wire browser steps to WebSocket bridge`
7. `feat(cli): add table/json/csv output formatters`
8. `feat(cli): add run, list, show, validate, doctor commands`
9. `feat(cli): add sample Hacker News top stories adapter`
10. `docs: add CLI section to README`
