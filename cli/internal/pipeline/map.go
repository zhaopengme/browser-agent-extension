package pipeline

import (
	"github.com/expr-lang/expr/vm"
)

// ExecMap transforms each item using the expression map.
// Pre-compiles expressions once, then runs them per item.
func ExecMap(ctx *PipelineContext, stepData map[string]any) ([]any, error) {
	// Pre-compile all string expressions once
	compiled := make(map[string]*vm.Program, len(stepData))
	for key, val := range stepData {
		if str, ok := val.(string); ok {
			prog, err := compileExpr(str)
			if err != nil {
				return nil, err
			}
			compiled[key] = prog
		}
	}

	var results []any
	for i, item := range ctx.Items {
		env := ctx.ExprEnv(i)
		env.Item = item
		newItem := make(map[string]any)
		for key, val := range stepData {
			if prog, ok := compiled[key]; ok {
				resolved, err := runExpr(prog, env)
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
