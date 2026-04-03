package pipeline

import (
	"fmt"

	"github.com/mobai/browser-agent-cli/internal/adapter"
	"github.com/mobai/browser-agent-cli/internal/bridge"
)

// Context holds shared state across pipeline steps.
type Context struct {
	Vars    map[string]any
	Results []map[string]any
}

// NewContext creates a new pipeline context.
func NewContext(vars map[string]any) *Context {
	return &Context{
		Vars: vars,
	}
}

// RunPipeline executes all steps in the adapter config and returns extracted items.
func RunPipeline(ctx *Context, cfg *adapter.Config, client *bridge.Client) ([]map[string]any, error) {
	for i, step := range cfg.Pipeline {
		if err := executeStep(ctx, step, client); err != nil {
			return nil, fmt.Errorf("step %d (%s): %w", i+1, step.Name, err)
		}
	}

	// Collect results
	var items []map[string]any
	for _, result := range ctx.Results {
		items = append(items, result)
	}

	if len(items) == 0 {
		items = []map[string]any{}
	}

	return items, nil
}

func executeStep(ctx *Context, step adapter.Step, client *bridge.Client) error {
	params := step.Params
	if params == nil {
		params = make(map[string]any)
	}

	resp, err := client.Send(step.Action, params)
	if err != nil {
		retries := step.Retries
		if retries <= 0 {
			retries = 1
		}
		for r := 0; r < retries; r++ {
			resp, err = client.Send(step.Action, params)
			if err == nil {
				break
			}
		}
		if err != nil {
			return fmt.Errorf("action %s: %w", step.Action, err)
		}
	}

	if !resp.Success {
		return fmt.Errorf("action %s failed: %s", step.Action, resp.Error)
	}

	// Store results
	if data, ok := resp.Data.([]any); ok {
		for _, item := range data {
			if m, ok := item.(map[string]any); ok {
				ctx.Results = append(ctx.Results, m)
			}
		}
	} else if resp.Data != nil {
		if m, ok := resp.Data.(map[string]any); ok {
			ctx.Results = append(ctx.Results, m)
		}
	}

	return nil
}
