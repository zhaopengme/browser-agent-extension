package pipeline

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/adapter"
)

// ExecuteStep dispatches a step to the appropriate handler.
func ExecuteStep(ctx *PipelineContext, stepName string, stepData map[string]any) ([]any, error) {
	switch stepName {
	case "limit":
		return ExecLimit(ctx, stepData)
	case "filter":
		return ExecFilter(ctx, stepData)
	case "map":
		return ExecMap(ctx, stepData)
	case "sort":
		return ExecSort(ctx, stepData)
	case "select":
		return ExecSelect(ctx, stepData)
	case "tap":
		return ExecTap(ctx, stepData)
	case "evaluate":
		return ExecEvaluate(ctx, stepData)
	case "fetch", "navigate", "click", "type", "wait", "intercept", "download":
		return nil, fmt.Errorf("browser step %q requires bridge (not yet wired)", stepName)
	default:
		return nil, fmt.Errorf("unknown step type: %s", stepName)
	}
}

// RunPipeline executes a full pipeline from a parsed config.
func RunPipeline(ctx *PipelineContext, cfg *adapter.AdapterConfig) ([]any, error) {
	var items []any

	for i, step := range cfg.Pipeline {
		stepName, stepData, err := stepToMap(step)
		if err != nil {
			return nil, fmt.Errorf("step %d: %w", i, err)
		}

		result, err := ExecuteStep(ctx, stepName, stepData)
		if err != nil {
			return nil, fmt.Errorf("step %d (%s): %w", i, stepName, err)
		}

		// Update context items for data steps
		if stepName == "map" || stepName == "filter" || stepName == "sort" ||
			stepName == "limit" || stepName == "select" || stepName == "evaluate" {
			ctx.Items = result
			items = result
		}
	}

	return items, nil
}

// stepToMap converts a Step struct to (name, data) pair.
func stepToMap(step adapter.Step) (string, map[string]any, error) {
	if step.Fetch != "" {
		return "fetch", map[string]any{"url": step.Fetch}, nil
	}
	if step.Navigate != "" {
		return "navigate", map[string]any{"url": step.Navigate}, nil
	}
	if step.Click != nil {
		switch v := step.Click.(type) {
		case string:
			return "click", map[string]any{"selector": v}, nil
		case map[string]any:
			return "click", v, nil
		}
		return "click", map[string]any{"selector": step.Click}, nil
	}
	if step.Type != nil {
		return "type", step.Type, nil
	}
	if step.Wait != nil {
		switch v := step.Wait.(type) {
		case string:
			return "wait", map[string]any{"selector": v}, nil
		case float64:
			return "wait", map[string]any{"timeout": int(v)}, nil
		case map[string]any:
			return "wait", v, nil
		}
		return "wait", map[string]any{"selector": step.Wait}, nil
	}
	if step.Intercept != "" {
		return "intercept", map[string]any{"urlPattern": step.Intercept}, nil
	}
	if step.Download != nil {
		switch v := step.Download.(type) {
		case string:
			return "download", map[string]any{"url": v}, nil
		default:
			return "download", map[string]any{"url": step.Download}, nil
		}
	}
	if step.Map != nil {
		return "map", step.Map, nil
	}
	if step.Filter != nil {
		return "filter", map[string]any{"expr": step.Filter}, nil
	}
	if step.Sort != nil {
		return "sort", map[string]any{"expr": step.Sort}, nil
	}
	if step.Limit != nil {
		return "limit", map[string]any{"expr": step.Limit}, nil
	}
	if step.Select != nil {
		return "select", map[string]any{"fields": step.Select}, nil
	}
	if step.Evaluate != "" {
		return "evaluate", map[string]any{"expression": step.Evaluate}, nil
	}
	if step.Tap != nil && *step.Tap {
		return "tap", map[string]any{}, nil
	}

	return "", nil, fmt.Errorf("step has no action")
}
