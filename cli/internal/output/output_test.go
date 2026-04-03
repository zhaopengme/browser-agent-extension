package output

import (
	"bytes"
	"io"
	"os"
	"testing"
)

func TestJSONOutput(t *testing.T) {
	old := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	items := []any{map[string]any{"name": "alice", "age": 30}}
	err := JSON(items)

	w.Close()
	os.Stdout = old

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var buf bytes.Buffer
	io.Copy(&buf, r)
	out := buf.String()
	if !bytes.Contains([]byte(out), []byte("alice")) {
		t.Errorf("expected 'alice' in output, got: %s", out)
	}
}

func TestCSVOutput(t *testing.T) {
	old := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	items := []any{
		map[string]any{"name": "alice", "age": 30},
		map[string]any{"name": "bob", "age": 25},
	}
	err := CSV(items, []string{"name", "age"})

	w.Close()
	os.Stdout = old

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var buf bytes.Buffer
	io.Copy(&buf, r)
	out := buf.String()
	if !bytes.Contains([]byte(out), []byte("alice")) {
		t.Errorf("expected 'alice' in output, got: %s", out)
	}
	if !bytes.Contains([]byte(out), []byte("name,age")) {
		t.Errorf("expected header 'name,age' in output, got: %s", out)
	}
}

func TestTableOutput(t *testing.T) {
	old := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	items := []any{map[string]any{"name": "alice"}}
	err := Table(items, []string{"name"})

	w.Close()
	os.Stdout = old

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var buf bytes.Buffer
	io.Copy(&buf, r)
	out := buf.String()
	if !bytes.Contains([]byte(out), []byte("alice")) {
		t.Errorf("expected 'alice' in output, got: %s", out)
	}
}

func TestRenderDispatcher(t *testing.T) {
	items := []any{map[string]any{"x": 1}}

	// JSON
	old := os.Stdout
	_, w, _ := os.Pipe()
	os.Stdout = w
	err := Render(items, nil, "json")
	w.Close()
	os.Stdout = old
	if err != nil {
		t.Errorf("json render failed: %v", err)
	}

	// CSV
	_, w, _ = os.Pipe()
	os.Stdout = w
	err = Render(items, []string{"x"}, "csv")
	w.Close()
	os.Stdout = old
	if err != nil {
		t.Errorf("csv render failed: %v", err)
	}

	// Table
	_, w, _ = os.Pipe()
	os.Stdout = w
	err = Render(items, nil, "table")
	w.Close()
	os.Stdout = old
	if err != nil {
		t.Errorf("table render failed: %v", err)
	}

	// Unknown
	err = Render(items, nil, "xml")
	if err == nil {
		t.Error("expected error for unknown format")
	}
}

func TestRenderEmptyTable(t *testing.T) {
	old := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w

	err := Table([]any{}, []string{"name"})

	w.Close()
	os.Stdout = old

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var buf bytes.Buffer
	io.Copy(&buf, r)
	out := buf.String()
	if !bytes.Contains([]byte(out), []byte("No items found")) {
		t.Errorf("expected 'No items found' in output, got: %s", out)
	}
}
