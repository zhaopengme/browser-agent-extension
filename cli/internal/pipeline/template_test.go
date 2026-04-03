package pipeline

import (
	"testing"
)

func TestResolveSimpleVariable(t *testing.T) {
	env := ExprEnv{
		Item:  map[string]any{"title": "hello"},
		Index: 0,
		Args:  map[string]any{"limit": 10},
		Vars:  map[string]any{},
	}

	result, err := Resolve("${{ item.title }}", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "hello" {
		t.Errorf("expected 'hello', got %v", result)
	}
}

func TestResolveMathExpression(t *testing.T) {
	env := ExprEnv{
		Item:  nil,
		Index: 0,
		Args:  map[string]any{"limit": 20},
		Vars:  map[string]any{},
	}

	result, err := Resolve("${{ Math.min(args.limit, 50) }}", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// expr returns float64 for math ops
	if f, ok := result.(float64); !ok || f != 20 {
		t.Errorf("expected 20, got %v", result)
	}
}

func TestResolveBooleanExpression(t *testing.T) {
	env := ExprEnv{
		Item:  map[string]any{"score": 150, "dead": false},
		Index: 0,
		Args:  map[string]any{},
		Vars:  map[string]any{},
	}

	result, err := Resolve("${{ item.score > 100 && !item.dead }}", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != true {
		t.Errorf("expected true, got %v", result)
	}
}

func TestResolveNoTemplate(t *testing.T) {
	env := ExprEnv{Args: map[string]any{}}
	result, err := Resolve("plain text", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "plain text" {
		t.Errorf("expected 'plain text', got %v", result)
	}
}

func TestResolveIntValue(t *testing.T) {
	env := ExprEnv{
		Item:  nil,
		Index: 0,
		Args:  map[string]any{"limit": 42},
		Vars:  map[string]any{},
	}

	result, err := Resolve("${{ args.limit }}", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Note: yaml/JSON unmarshal numbers as float64
	if f, ok := result.(float64); !ok || int(f) != 42 {
		// Also accept int
		if i, ok := result.(int); !ok || i != 42 {
			t.Errorf("expected 42, got %v", result)
		}
	}
}

func TestResolveStringInterpolation(t *testing.T) {
	env := ExprEnv{
		Item:  map[string]any{"id": 123},
		Index: 0,
		Args:  map[string]any{},
		Vars:  map[string]any{},
	}

	result, err := Resolve("https://api.example.com/item/${{ item.id }}.json", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "https://api.example.com/item/123.json" {
		t.Errorf("expected 'https://api.example.com/item/123.json', got %v", result)
	}
}

func TestResolveUnknownIdentifier(t *testing.T) {
	env := ExprEnv{
		Item:  nil,
		Index: 0,
		Args:  map[string]any{},
		Vars:  map[string]any{},
	}

	_, err := Resolve("${{ itme.title }}", env)
	if err == nil {
		t.Fatal("expected error for unknown identifier")
	}
}

func TestResolveInvalidSyntax(t *testing.T) {
	env := ExprEnv{
		Item:  nil,
		Index: 0,
		Args:  map[string]any{},
		Vars:  map[string]any{},
	}

	_, err := Resolve("${{ args. }}", env)
	if err == nil {
		t.Fatal("expected error for invalid expression syntax")
	}
}

func TestResolveAdjacentTemplates(t *testing.T) {
	env := ExprEnv{
		Item:  map[string]any{"a": 1, "b": 2},
		Index: 0,
		Args:  map[string]any{},
		Vars:  map[string]any{},
	}

	result, err := Resolve("${{ item.a }}-${{ item.b }}", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "1-2" {
		t.Errorf("expected '1-2', got %v", result)
	}
}

func TestResolveVarsAndIndex(t *testing.T) {
	env := ExprEnv{
		Item:  nil,
		Index: 5,
		Args:  map[string]any{},
		Vars:  map[string]any{"multiplier": 3},
	}

	result, err := Resolve("${{ index * vars.multiplier }}", env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Accept int or float
	switch v := result.(type) {
	case int:
		if v != 15 {
			t.Errorf("expected 15, got %v", result)
		}
	case float64:
		if v != 15 {
			t.Errorf("expected 15, got %v", result)
		}
	default:
		t.Errorf("expected int or float64, got %T", result)
	}
}

func TestResolveErrorInInterpolation(t *testing.T) {
	env := ExprEnv{
		Item:  nil,
		Index: 0,
		Args:  map[string]any{},
		Vars:  map[string]any{},
	}

	_, err := Resolve("prefix${{ bad. }}suffix", env)
	if err == nil {
		t.Fatal("expected error to propagate from interpolation")
	}
}
