package pipeline

import (
	"sort"
)

// ExecSort sorts items by expression value.
func ExecSort(ctx *PipelineContext, stepData map[string]any) ([]any, error) {
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

		valI, _ := Resolve(exprStr, envI)
		valJ, _ := Resolve(exprStr, envJ)

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
		return 0
	default:
		return 0
	}
}
