package pipeline

import (
	"testing"
)

func TestEngineLimitStep(t *testing.T) {
	ctx := NewContext(map[string]any{})
	ctx.Items = []any{
		map[string]any{"title": "a"},
		map[string]any{"title": "b"},
		map[string]any{"title": "c"},
	}

	step := map[string]any{"expr": 2}
	items, err := ExecuteStep(ctx, "limit", step)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 2 {
		t.Errorf("expected 2 items, got %d", len(items))
	}
}

func TestEngineFilterStep(t *testing.T) {
	ctx := NewContext(map[string]any{})
	ctx.Items = []any{
		map[string]any{"score": 50},
		map[string]any{"score": 150},
		map[string]any{"score": 200},
	}

	step := map[string]any{"expr": "item.score > 100"}
	items, err := ExecuteStep(ctx, "filter", step)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 2 {
		t.Errorf("expected 2 items, got %d", len(items))
	}
}

func TestEngineMapStep(t *testing.T) {
	ctx := NewContext(map[string]any{})
	ctx.Items = []any{
		map[string]any{"name": "alice"},
		map[string]any{"name": "bob"},
	}

	step := map[string]any{"label": "${{ item.name }}"}
	items, err := ExecuteStep(ctx, "map", step)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
	if items[0].(map[string]any)["label"] != "alice" {
		t.Errorf("expected first label 'alice', got %v", items[0].(map[string]any)["label"])
	}
}

func TestEngineSelectStep(t *testing.T) {
	ctx := NewContext(map[string]any{})
	ctx.Items = []any{
		map[string]any{"a": 1, "b": 2, "c": 3},
		map[string]any{"a": 10, "b": 20, "c": 30},
	}

	step := map[string]any{"fields": []string{"a", "c"}}
	items, err := ExecuteStep(ctx, "select", step)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
	m := items[0].(map[string]any)
	if _, ok := m["b"]; ok {
		t.Errorf("field 'b' should not be present")
	}
	if m["a"] != 1 {
		t.Errorf("expected a=1, got %v", m["a"])
	}
}

func TestEngineTapStep(t *testing.T) {
	ctx := NewContext(map[string]any{})
	ctx.Items = []any{map[string]any{"x": 1}}

	step := map[string]any{}
	items, err := ExecuteStep(ctx, "tap", step)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Errorf("expected 1 item, got %d", len(items))
	}
}

func TestEngineBrowserStepError(t *testing.T) {
	ctx := NewContext(map[string]any{})
	_, err := ExecuteStep(ctx, "navigate", map[string]any{"url": "x"})
	if err == nil {
		t.Fatal("expected error for browser step without bridge")
	}
}

func TestEngineUnknownStep(t *testing.T) {
	ctx := NewContext(map[string]any{})
	_, err := ExecuteStep(ctx, "foobar", map[string]any{})
	if err == nil {
		t.Fatal("expected error for unknown step type")
	}
}
