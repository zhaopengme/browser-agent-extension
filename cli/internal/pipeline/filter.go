package pipeline

import (
	"strings"
)

// ExecFilter keeps items matching the expression.
// Pre-compiles the expression once, then runs it per item.
func ExecFilter(ctx *PipelineContext, stepData map[string]any) ([]any, error) {
	exprVal, ok := stepData["expr"]
	if !ok {
		return ctx.Items, nil
	}

	exprStr, ok := exprVal.(string)
	if !ok {
		if b, ok := exprVal.(bool); ok && b {
			return ctx.Items, nil
		}
		return ctx.Items, nil
	}

	// Wrap raw expression in template syntax if needed
	if !strings.Contains(exprStr, "${{") {
		exprStr = "${{ " + exprStr + " }}"
	}

	// Pre-compile the expression once
	program, err := compileExpr(exprStr)
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
		if b, ok := res.(bool); ok && b {
			results = append(results, item)
		}
	}
	return results, nil
}
