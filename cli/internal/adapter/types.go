package adapter

// AdapterConfig is the top-level YAML adapter structure.
type AdapterConfig struct {
	Site        string         `yaml:"site"`
	Name        string         `yaml:"name"`
	Description string         `yaml:"description"`
	Strategy    string         `yaml:"strategy"` // public | cookie | header | intercept | ui
	Browser     bool           `yaml:"browser"`
	Args        map[string]Arg `yaml:"args"`
	Pipeline    []Step         `yaml:"pipeline"`
	Columns     []string       `yaml:"columns"`
}

// Arg defines a pipeline argument with type and default.
type Arg struct {
	Type        string `yaml:"type"`        // int | str | bool
	Default     any    `yaml:"default"`
	Description string `yaml:"description"`
}

// Step is a single pipeline step. One key will be set.
type Step struct {
	Fetch       string         `yaml:"fetch,omitempty"`
	Navigate    string         `yaml:"navigate,omitempty"`
	Click       any            `yaml:"click,omitempty"`        // string (selector) or map
	Type        map[string]any `yaml:"type,omitempty"`
	Wait        any            `yaml:"wait,omitempty"`         // string (selector), number (timeout), or map
	Intercept   string         `yaml:"intercept,omitempty"`
	Download    any            `yaml:"download,omitempty"`     // string (url) or map
	Map         map[string]any `yaml:"map,omitempty"`
	Filter      any            `yaml:"filter,omitempty"`       // string expression
	Sort        any            `yaml:"sort,omitempty"`         // string expression
	Limit       any            `yaml:"limit,omitempty"`        // int or string expression
	Select      any            `yaml:"select,omitempty"`       // []string or map
	Evaluate    string         `yaml:"evaluate,omitempty"`
	Tap         *bool          `yaml:"tap,omitempty"`          // true → print all, or map for custom
}
