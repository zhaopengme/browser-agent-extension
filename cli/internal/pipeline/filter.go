package pipeline

import (
	"strings"
)

// ExecFilter keeps items matching the expression.
// Pre-compiles the expression once, then runs it per item.
// Uses Go truthiness: non-empty strings, non-zero numbers, and non-nil values are truthy.
func ExecFilter(ctx *PipelineContext, stepData map[string]any) ([]any, error) {
	exprVal, ok := stepData["expr"]
	if !ok {
		return ctx.Items, nil
	}

	exprStr, ok := exprVal.(string)
	if !ok {
		if isTruthy(exprVal) {
			return ctx.Items, nil
		}
		return ctx.Items, nil
	}

	// Add truthy helper to the expression environment
	// This allows expressions like "item.title && !item.deleted" to work with non-bool values
	baseExpr := exprStr
	if !strings.Contains(baseExpr, "${{") {
		baseExpr = "${{ " + baseExpr + " }}"
	}

	// Pre-compile the expression once
	program, err := compileExpr(baseExpr)
	if err != nil {
		return nil, err
	}

	var results []any
	for i, item := range ctx.Items {
		env := ctx.ExprEnv(i)
		env.Item = item
		res, err := runExpr(program, env)
		if err != nil {
			return nil, err
		}
		if isTruthy(res) {
			results = append(results, item)
		}
	}
	return results, nil
}

// isTruthy evaluates Go truthiness for any type.
func isTruthy(v any) bool {
	if v == nil {
		return false
	}
	switch val := v.(type) {
	case bool:
		return val
	case string:
		return val != ""
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		return v != 0
	default:
		return true
	}
}
