package pipeline

import (
	"fmt"
	"strings"

	"github.com/agents-cc/browser-agent-extension/cli/internal/adapter"
	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline/steps/browser"
)

// ExecuteStep dispatches a step to the appropriate handler.
func ExecuteStep(ctx *PipelineContext, stepName string, stepData map[string]any, bridgeClient *bridge.Client, strategy string) ([]any, error) {
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
	case "fetch":
		urlRaw, _ := stepData["url"].(string)
		if urlRaw == "" {
			return nil, fmt.Errorf("fetch requires url")
		}
		// Resolve ${{ }} templates in the fetch URL using the current item context
		var url string
		if strings.Contains(urlRaw, "${{") {
			env := ctx.ExprEnv(0)
			resolved, err := Resolve(urlRaw, env)
			if err != nil {
				return nil, fmt.Errorf("resolve fetch url: %w", err)
			}
			url = formatValue(resolved)
		} else {
			url = urlRaw
		}
		// Build full stepData with resolved URL
		fetchData := make(map[string]any, len(stepData))
		for k, v := range stepData {
			fetchData[k] = v
		}
		fetchData["url"] = url
		return browser.ExecFetch(fetchData, strategy, bridgeClient)
	case "navigate":
		if err := browser.ExecNavigate(stepData, bridgeClient); err != nil {
			return nil, err
		}
		return ctx.Items, nil
	case "click":
		if err := browser.ExecClick(stepData, bridgeClient); err != nil {
			return nil, err
		}
		return ctx.Items, nil
	case "type":
		if err := browser.ExecType(stepData, bridgeClient); err != nil {
			return nil, err
		}
		return ctx.Items, nil
	case "wait":
		if err := browser.ExecWait(stepData, bridgeClient); err != nil {
			return nil, err
		}
		return ctx.Items, nil
	case "intercept":
		if err := browser.ExecIntercept(stepData, bridgeClient); err != nil {
			return nil, err
		}
		return ctx.Items, nil
	case "download":
		if err := browser.ExecDownload(stepData, bridgeClient); err != nil {
			return nil, err
		}
		return ctx.Items, nil
	default:
		return nil, fmt.Errorf("unknown step type: %s", stepName)
	}
}

// RunPipeline executes a full pipeline from a parsed config.
func RunPipeline(ctx *PipelineContext, cfg *adapter.AdapterConfig, bridgeClient *bridge.Client) ([]any, error) {
	var items []any

	for i, step := range cfg.Pipeline {
		stepName, stepData, err := stepToMap(step)
		if err != nil {
			return nil, fmt.Errorf("step %d: %w", i, err)
		}

		result, err := ExecuteStep(ctx, stepName, stepData, bridgeClient, cfg.Strategy)
		if err != nil {
			return nil, fmt.Errorf("step %d (%s): %w", i, stepName, err)
		}

		// Update context items for data steps
		if stepName == "map" || stepName == "filter" || stepName == "sort" ||
			stepName == "limit" || stepName == "select" || stepName == "evaluate" ||
			stepName == "fetch" {
			ctx.Items = result
			items = result
		}
	}

	return items, nil
}

// stepToMap converts a Step struct to (name, data) pair.
func stepToMap(step adapter.Step) (string, map[string]any, error) {
	if step.Fetch != nil {
		switch v := step.Fetch.(type) {
		case string:
			return "fetch", map[string]any{"url": v}, nil
		case map[string]any:
			return "fetch", v, nil
		}
		return "", nil, fmt.Errorf("fetch requires a string url or map params, got %T", step.Fetch)
	}
	if step.Navigate != nil {
		switch v := step.Navigate.(type) {
		case string:
			return "navigate", map[string]any{"url": v}, nil
		case map[string]any:
			return "navigate", v, nil
		}
		return "", nil, fmt.Errorf("navigate requires a string url or map params, got %T", step.Navigate)
	}
	if step.Click != nil {
		switch v := step.Click.(type) {
		case string:
			return "click", map[string]any{"selector": v}, nil
		case map[string]any:
			return "click", v, nil
		}
		return "", nil, fmt.Errorf("click requires a string selector or map params, got %T", step.Click)
	}
	if step.Type != nil {
		return "type", step.Type, nil
	}
	if step.Wait != nil {
		switch v := step.Wait.(type) {
		case string:
			return "wait", map[string]any{"selector": v}, nil
		case int:
			return "wait", map[string]any{"timeout": v}, nil
		case float64:
			return "wait", map[string]any{"timeout": int(v)}, nil
		case map[string]any:
			return "wait", v, nil
		}
		return "", nil, fmt.Errorf("wait requires a string selector, numeric timeout, or map params, got %T", step.Wait)
	}
	if step.Intercept != nil {
		switch v := step.Intercept.(type) {
		case string:
			return "intercept", map[string]any{"urlPattern": v}, nil
		case map[string]any:
			// Support both "pattern" and "urlPattern" keys
			params := make(map[string]any, len(v))
			for k, val := range v {
				if k == "pattern" {
					params["urlPattern"] = val
				} else {
					params[k] = val
				}
			}
			return "intercept", params, nil
		}
		return "", nil, fmt.Errorf("intercept requires a string urlPattern or map params, got %T", step.Intercept)
	}
	if step.Download != nil {
		switch v := step.Download.(type) {
		case string:
			return "download", map[string]any{"url": v}, nil
		case map[string]any:
			return "download", v, nil
		}
		return "", nil, fmt.Errorf("download requires a string url or map params, got %T", step.Download)
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
	if step.Tap != nil {
		switch v := step.Tap.(type) {
		case bool:
			if v {
				return "tap", map[string]any{}, nil
			}
		case map[string]any:
			return "tap", v, nil
		}
		return "", nil, fmt.Errorf("tap requires true or map params, got %T", step.Tap)
	}

	return "", nil, fmt.Errorf("step has no action")
}

// formatValue formats a value for use in URLs, avoiding scientific notation for large numbers.
func formatValue(v any) string {
	switch val := v.(type) {
	case float64:
		if val == float64(int64(val)) {
			return fmt.Sprintf("%d", int64(val))
		}
		return fmt.Sprintf("%g", val)
	case int:
		return fmt.Sprintf("%d", val)
	case int64:
		return fmt.Sprintf("%d", val)
	default:
		return fmt.Sprintf("%v", val)
	}
}
