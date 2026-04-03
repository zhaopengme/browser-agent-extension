package pipeline

import (
	"fmt"
	"sort"
)

// ExecSort sorts items by expression value.
// Pre-compiles the expression once, returns errors from expression evaluation.
func ExecSort(ctx *PipelineContext, stepData map[string]any) ([]any, error) {
	exprVal, ok := stepData["expr"]
	if !ok {
		return ctx.Items, nil
	}

	exprStr, ok := exprVal.(string)
	if !ok {
		return ctx.Items, nil
	}

	// Pre-compile the expression once
	program, err := compileExpr(exprStr)
	if err != nil {
		return nil, fmt.Errorf("sort expression: %w", err)
	}

	// Evaluate expression for each item once (avoids O(n log n) compilations)
	values := make([]float64, len(ctx.Items))
	for i, item := range ctx.Items {
		env := ctx.ExprEnv(i)
		env.Item = item
		val, err := runExpr(program, env)
		if err != nil {
			return nil, fmt.Errorf("sort item %d: %w", i, err)
		}
		values[i] = compare(val)
	}

	results := make([]any, len(ctx.Items))
	copy(results, ctx.Items)

	sort.Slice(results, func(i, j int) bool {
		return values[i] < values[j]
	})

	return results, nil
}

func compare(v any) float64 {
	switch val := v.(type) {
	case int:
		return float64(val)
	case float64:
		return val
	case int64:
		return float64(val)
	case string:
		return 0
	default:
		return 0
	}
}
