package pipeline

// ExecLimit truncates items to N items.
func ExecLimit(ctx *PipelineContext, stepData map[string]any) ([]any, error) {
	exprVal := stepData["expr"]

	var n int
	switch v := exprVal.(type) {
	case int:
		n = v
	case float64:
		n = int(v)
	case string:
		env := ctx.ExprEnv(0)
		resolved, err := Resolve(v, env)
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
