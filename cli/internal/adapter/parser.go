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

	if err := Validate(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// Validate checks required fields and valid values.
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

// Discover searches for *.yaml files in adapters/ (cwd) and ~/.bae/adapters/.
func Discover() ([]string, error) {
	var found []string

	// Search cwd/adapters/
	localDir := filepath.Join(".", "adapters")
	if files, err := yamlFiles(localDir); err == nil {
		found = append(found, files...)
	}

	// Search ~/.bae/adapters/
	home, err := os.UserHomeDir()
	if err == nil {
		globalDir := filepath.Join(home, ".bae", "adapters")
		if files, err := yamlFiles(globalDir); err == nil {
			found = append(found, files...)
		}
	}

	return found, nil
}

func yamlFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".yaml") {
			files = append(files, filepath.Join(dir, e.Name()))
		}
	}
	return files, nil
}
