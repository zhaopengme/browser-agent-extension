package pipeline

// ExecMap transforms each item using the expression map.
func ExecMap(ctx *PipelineContext, stepData map[string]any) ([]any, error) {
	var results []any
	for i, item := range ctx.Items {
		env := ctx.ExprEnv(i)
		env.Item = item
		newItem := make(map[string]any)
		for key, val := range stepData {
			if str, ok := val.(string); ok {
				resolved, err := Resolve(str, env)
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
