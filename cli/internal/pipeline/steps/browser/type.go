package browser

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecType sends a type action to the extension.
func ExecType(stepData map[string]any, client *bridge.Client) error {
	if client == nil {
		return fmt.Errorf("type requires bridge client")
	}
	selector, _ := stepData["selector"].(string)
	text, _ := stepData["text"].(string)
	if text == "" {
		return fmt.Errorf("type requires text")
	}
	params := map[string]any{"text": text}
	if selector != "" {
		params["selector"] = selector
	}

	payload, err := client.Send("type", params)
	if err != nil {
		return fmt.Errorf("type: %w", err)
	}
	if !payload.Success {
		return fmt.Errorf("type failed: %s", payload.Error)
	}
	return nil
}
