package browser

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecIntercept enables network capture and waits for a matching response.
func ExecIntercept(stepData map[string]any, client *bridge.Client) error {
	if client == nil {
		return fmt.Errorf("intercept requires bridge client")
	}
	payload, err := client.Send("enable_network", nil)
	if err != nil {
		return fmt.Errorf("enable_network: %w", err)
	}
	if !payload.Success {
		return fmt.Errorf("enable_network failed: %s", payload.Error)
	}

	urlPattern, ok := stepData["urlPattern"].(string)
	if !ok {
		return fmt.Errorf("intercept requires urlPattern")
	}
	params := map[string]any{"urlPattern": urlPattern}
	if method, ok := stepData["method"]; ok {
		params["method"] = method
	}
	if timeout, ok := stepData["timeout"]; ok {
		params["timeout"] = timeout
	}

	payload, err = client.Send("wait_for_response", params)
	if err != nil {
		return fmt.Errorf("wait_for_response: %w", err)
	}
	if !payload.Success {
		return fmt.Errorf("wait_for_response failed: %s", payload.Error)
	}
	return nil
}
