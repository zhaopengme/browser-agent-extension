package pipeline

// ExecSelect picks specific fields from each item.
func ExecSelect(ctx *PipelineContext, stepData map[string]any) ([]any, error) {
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
