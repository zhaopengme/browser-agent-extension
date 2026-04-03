package pipeline

import (
	"fmt"
	"strings"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecEvaluate runs JS via the extension bridge and returns the result as items.
func ExecEvaluate(ctx *PipelineContext, stepData map[string]any, client *bridge.Client) ([]any, error) {
	expr, _ := stepData["expression"].(string)
	if expr == "" {
		return ctx.Items, nil
	}
	if client == nil {
		return nil, fmt.Errorf("evaluate requires bridge client")
	}

	// Resolve ${{ }} templates in the expression
	script := expr
	if strings.Contains(script, "${{") {
		env := ctx.ExprEnv(0)
		resolved, err := Resolve(script, env)
		if err != nil {
			return nil, fmt.Errorf("resolve evaluate expression: %w", err)
		}
		resolvedStr, ok := resolved.(string)
		if !ok {
			script = fmt.Sprintf("%v", resolved)
		} else {
			script = resolvedStr
		}
	}

	payload, err := client.Send("evaluate", map[string]any{"script": script})
	if err != nil {
		return nil, fmt.Errorf("evaluate: %w", err)
	}
	if !payload.Success {
		return nil, fmt.Errorf("evaluate failed: %s", payload.Error)
	}

	if payload.Data == nil {
		return nil, nil
	}

	// Unwrap nested bridge response: { data: { result: [...] }, success: true }
	// The extension wraps evaluate results, so we need to drill down to the actual array.
	data := unwrapData(payload.Data)
	if data == nil {
		return nil, nil
	}

	if items, ok := data.([]any); ok {
		return items, nil
	}
	return []any{data}, nil
}

// unwrapData drills through nested wrappers like { data: { result: X } } to find the actual data.
func unwrapData(v any) any {
	m, ok := v.(map[string]any)
	if !ok {
		return v
	}
	// Look for data.data.result, data.result, or data.data patterns
	if inner, ok := m["data"].(map[string]any); ok {
		if result, ok := inner["result"]; ok {
			return result
		}
		return inner
	}
	if result, ok := m["result"]; ok {
		return result
	}
	return v
}
