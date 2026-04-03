package pipeline

// ExecEvaluate runs JS via the extension bridge.
// Placeholder: returns items unchanged (bridge wiring in Task 6).
func ExecEvaluate(ctx *PipelineContext, stepData map[string]any) ([]any, error) {
	return ctx.Items, nil
}
