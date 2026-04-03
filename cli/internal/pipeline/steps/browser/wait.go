package browser

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecWait sends a wait action to the extension.
func ExecWait(stepData map[string]any, client *bridge.Client) error {
	if client == nil {
		return fmt.Errorf("wait requires bridge client")
	}
	if selector, ok := stepData["selector"].(string); ok {
		params := map[string]any{"selector": selector, "visible": true}
		if timeout, ok := stepData["timeout"]; ok {
			params["timeout"] = timeout
		}
		payload, err := client.Send("wait_for_selector", params)
		if err != nil {
			return fmt.Errorf("wait_for_selector: %w", err)
		}
		if !payload.Success {
			return fmt.Errorf("wait_for_selector failed: %s", payload.Error)
		}
		return nil
	}

	if timeout, ok := stepData["timeout"]; ok {
		var ms int
		switch v := timeout.(type) {
		case int:
			ms = v
		case float64:
			ms = int(v)
		default:
			return fmt.Errorf("wait timeout must be a number")
		}
		payload, err := client.Send("wait_for_timeout", map[string]any{"ms": ms})
		if err != nil {
			return fmt.Errorf("wait_for_timeout: %w", err)
		}
		if !payload.Success {
			return fmt.Errorf("wait_for_timeout failed: %s", payload.Error)
		}
		return nil
	}

	return fmt.Errorf("wait requires selector or timeout")
}
