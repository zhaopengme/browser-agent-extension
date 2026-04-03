package browser

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"time"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

var sharedHTTPClient = &http.Client{
	Timeout: 30 * time.Second,
	Transport: &http.Transport{
		MaxIdleConnsPerHost: 10,
	},
}

// ExecFetch performs an HTTP request.
// stepData contains: url (required), params (optional query params), method (optional), headers (optional).
// For public strategy, uses Go net/http directly.
// For cookie strategy, gets cookies from extension and applies them.
func ExecFetch(stepData map[string]any, strategy string, client *bridge.Client) ([]any, error) {
	urlStr, _ := stepData["url"].(string)
	if urlStr == "" {
		return nil, fmt.Errorf("fetch requires url")
	}

	// Build URL with query params if provided
	if params, ok := stepData["params"].(map[string]any); ok && len(params) > 0 {
		u, err := url.Parse(urlStr)
		if err != nil {
			return nil, fmt.Errorf("parse url: %w", err)
		}
		q := u.Query()
		for k, v := range params {
			q.Set(k, fmt.Sprintf("%v", v))
		}
		u.RawQuery = q.Encode()
		urlStr = u.String()
	}

	var body []byte
	var err error

	switch strategy {
	case "public":
		body, err = httpGet(urlStr)
	case "cookie":
		body, err = httpGetWithCookies(urlStr, client)
	default:
		body, err = httpGet(urlStr)
	}

	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", urlStr, err)
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

func httpGet(urlStr string) ([]byte, error) {
	// Validate URL scheme
	u, err := url.Parse(urlStr)
	if err != nil {
		return nil, fmt.Errorf("parse url: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("unsupported url scheme: %s (only http/https allowed)", u.Scheme)
	}

	resp, err := sharedHTTPClient.Get(urlStr)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d %s", resp.StatusCode, resp.Status)
	}

	return io.ReadAll(resp.Body)
}

func httpGetWithCookies(urlStr string, bridgeClient *bridge.Client) ([]byte, error) {
	payload, err := bridgeClient.Send("get_cookies", nil)
	if err != nil {
		return nil, fmt.Errorf("get_cookies: %w", err)
	}
	if !payload.Success {
		return nil, fmt.Errorf("get_cookies failed: %s", payload.Error)
	}

	// Parse cookies from extension response and apply to HTTP request
	cookies, _ := payload.Data.([]any)

	u, err := url.Parse(urlStr)
	if err != nil {
		return nil, fmt.Errorf("parse url: %w", err)
	}

	jar, _ := cookiejar.New(nil)
	var httpCookies []*http.Cookie
	for _, c := range cookies {
		if cm, ok := c.(map[string]any); ok {
			name, _ := cm["name"].(string)
			value, _ := cm["value"].(string)
			if name != "" {
				httpCookies = append(httpCookies, &http.Cookie{
					Name:  name,
					Value: value,
					Domain: u.Hostname(),
					Path:  "/",
				})
			}
		}
	}
	if len(httpCookies) > 0 {
		jar.SetCookies(u, httpCookies)
	}

	reqClient := &http.Client{
		Timeout: 30 * time.Second,
		Jar:     jar,
		Transport: &http.Transport{
			MaxIdleConnsPerHost: 10,
		},
	}

	resp, err := reqClient.Get(urlStr)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d %s", resp.StatusCode, resp.Status)
	}

	return io.ReadAll(resp.Body)
}
