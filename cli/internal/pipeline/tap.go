package pipeline

import (
	"fmt"
)

// ExecTap prints items for debugging and passes them through.
func ExecTap(ctx *PipelineContext, stepData map[string]any) ([]any, error) {
	fmt.Printf("--- TAP: %d items ---\n", len(ctx.Items))
	for i, item := range ctx.Items {
		fmt.Printf("  [%d] %+v\n", i, item)
	}
	fmt.Println("--- END TAP ---")
	return ctx.Items, nil
}
