package pipeline

import (
	"strings"
)

// ExecFilter keeps items matching the expression.
func ExecFilter(ctx *PipelineContext, stepData map[string]any) ([]any, error) {
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
			if b, ok := exprVal.(bool); ok && b {
				results = append(results, item)
			}
			continue
		}
		// Wrap raw expression in template syntax if needed
		if !strings.Contains(exprStr, "${{") {
			exprStr = "${{ " + exprStr + " }}"
		}
		res, err := Resolve(exprStr, env)
		if err != nil {
			return nil, err
		}
		if b, ok := res.(bool); ok && b {
			results = append(results, item)
		}
	}
	return results, nil
}
