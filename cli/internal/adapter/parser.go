package adapter

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Parse reads a YAML file and returns an AdapterConfig.
func Parse(path string) (*AdapterConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}

	var cfg AdapterConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse yaml: %w", err)
	}

	if err := ValidateAndApplyDefaults(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// ValidateAndApplyDefaults checks required fields and applies default values.
// NOTE: This function mutates cfg (e.g., sets Strategy to "public" if empty).
func ValidateAndApplyDefaults(cfg *AdapterConfig) error {
	if cfg.Site == "" {
		return fmt.Errorf("missing required field: site")
	}
	if cfg.Name == "" {
		return fmt.Errorf("missing required field: name")
	}
	if len(cfg.Pipeline) == 0 {
		return fmt.Errorf("pipeline must have at least one step")
	}

	// Default strategy
	if cfg.Strategy == "" {
		cfg.Strategy = "public"
	}

	// Validate strategy
	validStrategies := map[string]bool{
		"public": true, "cookie": true, "header": true, "intercept": true, "ui": true,
	}
	if !validStrategies[cfg.Strategy] {
		return fmt.Errorf("invalid strategy: %s", cfg.Strategy)
	}

	return nil
}

// Validate checks required fields and valid values (does not mutate cfg).
func Validate(cfg *AdapterConfig) error {
	if cfg.Site == "" {
		return fmt.Errorf("missing required field: site")
	}
	if cfg.Name == "" {
		return fmt.Errorf("missing required field: name")
	}
	if len(cfg.Pipeline) == 0 {
		return fmt.Errorf("pipeline must have at least one step")
	}

	// Validate strategy (without applying defaults)
	if cfg.Strategy == "" {
		return nil // absent strategy is valid for dry-run validation
	}
	validStrategies := map[string]bool{
		"public": true, "cookie": true, "header": true, "intercept": true, "ui": true,
	}
	if !validStrategies[cfg.Strategy] {
		return fmt.Errorf("invalid strategy: %s", cfg.Strategy)
	}

	return nil
}

// Discover searches for *.yaml files in adapters/ (cwd and parent) and ~/.bae/adapters/.
func Discover() ([]string, error) {
	var found []string

	// Search cwd/adapters/
	if files, err := yamlFiles(filepath.Join(".", "adapters")); err == nil {
		found = append(found, files...)
	}

	// Search ../adapters/ (project root, for when running from cli/)
	if files, err := yamlFiles(filepath.Join("..", "adapters")); err == nil {
		for _, f := range files {
			abs, _ := filepath.Abs(f)
			found = append(found, abs)
		}
	}

	// Search ~/.bae/adapters/
	home, err := os.UserHomeDir()
	if err == nil {
		if files, err := yamlFiles(filepath.Join(home, ".bae", "adapters")); err == nil {
			found = append(found, files...)
		}
	}

	return found, nil
}

func yamlFiles(dir string) ([]string, error) {
	var files []string
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(d.Name(), ".yaml") {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return files, nil
}
