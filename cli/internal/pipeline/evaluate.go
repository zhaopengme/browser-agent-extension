package pipeline

// ExecEvaluate runs JS via the extension bridge.
// When a bridge client is provided, it sends the expression to the extension.
// Currently returns items unchanged — full bridge wiring is a future enhancement.
func ExecEvaluate(ctx *PipelineContext, stepData map[string]any) ([]any, error) {
	return ctx.Items, nil
}
