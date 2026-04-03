package adapter

import (
	"os"
	"path/filepath"
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
	os.WriteFile(f1, []byte("site: a\nname: b\npipeline:\n  - fetch: x\n"), 0644)
	os.WriteFile(f2, []byte("site: c\nname: d\npipeline:\n  - fetch: y\n"), 0644)

	files, err := yamlFiles(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 files, got %d", len(files))
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
