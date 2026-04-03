package browser

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

// ExecFetch performs an HTTP request. For public strategy, uses Go net/http directly.
func ExecFetch(url string, strategy string, client *bridge.Client) ([]any, error) {
	var body []byte
	var err error

	switch strategy {
	case "public":
		body, err = httpGet(url)
	case "cookie":
		body, err = httpGetWithCookies(url, client)
	default:
		body, err = httpGet(url)
	}

	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", url, err)
	}

	var result any
	if err := json.Unmarshal(body, &result); err != nil {
		return []any{string(body)}, nil
	}

	if arr, ok := result.([]any); ok {
		return arr, nil
	}

	return []any{result}, nil
}

func httpGet(url string) ([]byte, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func httpGetWithCookies(url string, client *bridge.Client) ([]byte, error) {
	payload, err := client.Send("get_cookies", nil)
	if err != nil {
		return nil, fmt.Errorf("get_cookies: %w", err)
	}
	if !payload.Success {
		return nil, fmt.Errorf("get_cookies failed: %s", payload.Error)
	}
	return httpGet(url)
}
