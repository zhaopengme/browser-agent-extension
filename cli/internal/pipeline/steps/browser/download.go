package browser

import (
	"fmt"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecDownload sends a download action to the extension.
func ExecDownload(stepData map[string]any, client *bridge.Client) error {
	if client == nil {
		return fmt.Errorf("download requires bridge client")
	}
	params := make(map[string]any)
	if url, ok := stepData["url"].(string); ok {
		params["url"] = url
	}
	if index, ok := stepData["index"].(int); ok {
		params["index"] = index
	}
	if len(params) == 0 {
		return fmt.Errorf("download requires url or index")
	}

	payload, err := client.Send("download", params)
	if err != nil {
		return fmt.Errorf("download: %w", err)
	}
	if !payload.Success {
		return fmt.Errorf("download failed: %s", payload.Error)
	}
	return nil
}
