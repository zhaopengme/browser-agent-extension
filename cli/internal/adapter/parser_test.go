package adapter

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseValidYAML(t *testing.T) {
	content := `
site: test
name: example
strategy: public
pipeline:
  - fetch: https://example.com
`
	tmp := writeTempFile(t, content)
	cfg, err := Parse(tmp)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Site != "test" {
		t.Errorf("expected site 'test', got '%s'", cfg.Site)
	}
	if len(cfg.Pipeline) != 1 {
		t.Errorf("expected 1 step, got %d", len(cfg.Pipeline))
	}
}

func TestParseMissingSite(t *testing.T) {
	content := `
name: example
pipeline:
  - fetch: https://example.com
`
	tmp := writeTempFile(t, content)
	_, err := Parse(tmp)
	if err == nil {
		t.Fatal("expected error for missing site")
	}
}

func TestParseEmptyPipeline(t *testing.T) {
	content := `
site: test
name: example
pipeline: []
`
	tmp := writeTempFile(t, content)
	_, err := Parse(tmp)
	if err == nil {
		t.Fatal("expected error for empty pipeline")
	}
}

func TestDiscover(t *testing.T) {
	// Create temp adapters dir
	dir := t.TempDir()
	f1 := filepath.Join(dir, "test1.yaml")
	f2 := filepath.Join(dir, "test2.yaml")
	if err := os.WriteFile(f1, []byte("site: a\nname: b\npipeline:\n  - fetch: x\n"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}
	if err := os.WriteFile(f2, []byte("site: c\nname: d\npipeline:\n  - fetch: y\n"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	files, err := yamlFiles(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 files, got %d", len(files))
	}
}

func TestParseInvalidStrategy(t *testing.T) {
	content := `
site: test
name: example
strategy: invalid
pipeline:
  - fetch: https://example.com
`
	tmp := writeTempFile(t, content)
	_, err := Parse(tmp)
	if err == nil {
		t.Fatal("expected error for invalid strategy")
	}
}

func TestParseDefaultStrategy(t *testing.T) {
	content := `
site: test
name: example
pipeline:
  - fetch: https://example.com
`
	tmp := writeTempFile(t, content)
	cfg, err := Parse(tmp)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Strategy != "public" {
		t.Errorf("expected default strategy 'public', got '%s'", cfg.Strategy)
	}
}

func TestParseMalformedYAML(t *testing.T) {
	content := `
site: test
name: [unclosed
pipeline:
  - fetch: https://example.com
`
	tmp := writeTempFile(t, content)
	_, err := Parse(tmp)
	if err == nil {
		t.Fatal("expected error for malformed YAML")
	}
}

func TestDiscoverEndToEnd(t *testing.T) {
	// Save and restore cwd
	cwd, _ := os.Getwd()
	t.Cleanup(func() { os.Chdir(cwd) })

	// Create temp dir and chdir into it
	dir := t.TempDir()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("failed to chdir: %v", err)
	}

	// Create adapters/ subdirectory
	adaptersDir := filepath.Join(dir, "adapters")
	if err := os.Mkdir(adaptersDir, 0755); err != nil {
		t.Fatalf("failed to create adapters dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(adaptersDir, "test.yaml"),
		[]byte("site: a\nname: b\npipeline:\n  - fetch: x\n"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	files, err := Discover()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(files))
	}
	if !strings.HasSuffix(files[0], "adapters/test.yaml") {
		t.Errorf("expected adapters/test.yaml, got %s", files[0])
	}
}

func writeTempFile(t *testing.T, content string) string {
	t.Helper()
	tmp := filepath.Join(t.TempDir(), "adapter.yaml")
	if err := os.WriteFile(tmp, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write temp file: %v", err)
	}
	return tmp
}
