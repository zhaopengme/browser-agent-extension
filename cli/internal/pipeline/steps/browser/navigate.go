package browser

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecNavigate sends a navigate action to the extension.
func ExecNavigate(stepData map[string]any, client *bridge.Client) error {
	if client == nil {
		return fmt.Errorf("navigate requires bridge client")
	}
	url, ok := stepData["url"].(string)
	if !ok {
		return fmt.Errorf("navigate requires url")
	}
	payload, err := client.Send("navigate", map[string]any{"url": url})
	if err != nil {
		return fmt.Errorf("navigate: %w", err)
	}
	if !payload.Success {
		return fmt.Errorf("navigate failed: %s", payload.Error)
	}
	return nil
}
