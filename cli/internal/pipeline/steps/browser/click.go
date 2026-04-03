package browser

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecClick sends a click action to the extension.
func ExecClick(stepData map[string]any, client *bridge.Client) error {
	if client == nil {
		return fmt.Errorf("click requires bridge client")
	}
	params := make(map[string]any)
	if selector, ok := stepData["selector"].(string); ok {
		params["selector"] = selector
	}
	if index, ok := stepData["index"].(int); ok {
		params["index"] = index
	}
	if len(params) == 0 {
		return fmt.Errorf("click requires selector or index")
	}

	payload, err := client.Send("click", params)
	if err != nil {
		return fmt.Errorf("click: %w", err)
	}
	if !payload.Success {
		return fmt.Errorf("click failed: %s", payload.Error)
	}
	return nil
}
