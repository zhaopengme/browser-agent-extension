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
	Positional  bool   `yaml:"positional"`  // if true, accepts positional arg
	Description string `yaml:"description"`
}

// Step is a single pipeline step. One key will be set.
type Step struct {
	Fetch       any            `yaml:"fetch,omitempty"`        // string (url) or map {url, params, method, headers}
	Navigate    any            `yaml:"navigate,omitempty"`     // string (url) or map {url, settleMs, ...}
	Click       any            `yaml:"click,omitempty"`        // string (selector) or map
	Type        map[string]any `yaml:"type,omitempty"`
	Wait        any            `yaml:"wait,omitempty"`         // string (selector), number (timeout), or map
	Intercept   any            `yaml:"intercept,omitempty"`    // string (urlPattern) or map {pattern, collect, ...}
	Download    any            `yaml:"download,omitempty"`     // string (url) or map
	Map         map[string]any `yaml:"map,omitempty"`
	Filter      any            `yaml:"filter,omitempty"`       // string expression
	Sort        any            `yaml:"sort,omitempty"`         // string expression
	Limit       any            `yaml:"limit,omitempty"`        // int or string expression
	Select      any            `yaml:"select,omitempty"`       // []string or map
	Evaluate    string         `yaml:"evaluate,omitempty"`
	Tap         any            `yaml:"tap,omitempty"`          // true (print all) or map {store, action, ...}
}
