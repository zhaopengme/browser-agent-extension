package adapter

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Arg defines a pipeline argument.
type Arg struct {
	Type        string `yaml:"type"`
	Default     any    `yaml:"default"`
	Description string `yaml:"description"`
}

// Step defines a single pipeline step.
type Step struct {
	Name    string         `yaml:"name"`
	Action  string         `yaml:"action"`
	Params  map[string]any `yaml:"params"`
	Outputs []string       `yaml:"outputs"`
	If      string         `yaml:"if"`
	Retries int            `yaml:"retries"`
}

// Config is the top-level adapter configuration.
type Config struct {
	Site        string         `yaml:"site"`
	Name        string         `yaml:"name"`
	Description string         `yaml:"description"`
	Strategy    string         `yaml:"strategy"`
	Args        map[string]Arg `yaml:"args"`
	Pipeline    []Step         `yaml:"pipeline"`
	Columns     []string       `yaml:"columns"`
}

// Parse reads and validates an adapter YAML file.
func Parse(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse yaml: %w", err)
	}

	if cfg.Site == "" {
		return nil, fmt.Errorf("missing required field: site")
	}
	if cfg.Name == "" {
		return nil, fmt.Errorf("missing required field: name")
	}
	if len(cfg.Pipeline) == 0 {
		return nil, fmt.Errorf("pipeline must have at least one step")
	}

	return &cfg, nil
}

// Discover finds adapter YAML files in common locations.
func Discover() ([]string, error) {
	var files []string

	// Check adapters/ directory
	if matches, err := filepath.Glob("adapters/*.yaml"); err == nil {
		files = append(files, matches...)
	}

	// Check ~/.bae/adapters/
	if home, err := os.UserHomeDir(); err == nil {
		globalDir := filepath.Join(home, ".bae", "adapters")
		if matches, err := filepath.Glob(filepath.Join(globalDir, "*.yaml")); err == nil {
			files = append(files, matches...)
		}
	}

	return files, nil
}
