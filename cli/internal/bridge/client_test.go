package bridge

import (
	"testing"
	"time"
)

func TestBridgeConnectionFails(t *testing.T) {
	client := NewClient("ws://localhost:9999", 2*time.Second)
	err := client.Connect()
	if err == nil {
		t.Fatal("expected connection error")
	}
}

func TestMapAction(t *testing.T) {
	tests := []struct {
		step     string
		expected string
	}{
		{"navigate", "navigate"},
		{"click", "click"},
		{"wait", "wait_for_selector"},
		{"unknown", "unknown"},
	}
	for _, tt := range tests {
		if got := MapAction(tt.step); got != tt.expected {
			t.Errorf("MapAction(%q) = %q, want %q", tt.step, got, tt.expected)
		}
	}
}

func TestBuildParams(t *testing.T) {
	// wait action adds visible=true when no timeout
	params := BuildParams("wait_for_selector", map[string]any{"selector": "#btn"})
	if params["visible"] != true {
		t.Errorf("expected visible=true, got %v", params["visible"])
	}

	// wait action with timeout does NOT add visible
	params2 := BuildParams("wait_for_selector", map[string]any{"selector": "#btn", "timeout": 5000})
	if _, ok := params2["visible"]; ok {
		t.Errorf("did not expect visible when timeout is set")
	}

	// Other actions pass params unchanged
	params3 := BuildParams("navigate", map[string]any{"url": "https://x.com"})
	if params3["url"] != "https://x.com" {
		t.Errorf("expected url, got %v", params3)
	}
}
