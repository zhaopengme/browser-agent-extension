package pipeline

// PipelineContext holds the execution state for a pipeline run.
type PipelineContext struct {
	Args  map[string]any // User-provided arguments (from CLI flags)
	Items []any          // Current data items flowing through steps
	Vars  map[string]any // Pipeline-scoped variables (set by steps)
}

// NewContext creates a new PipelineContext with defaults.
func NewContext(args map[string]any) *PipelineContext {
	return &PipelineContext{
		Args:  args,
		Items: []any{},
		Vars:  make(map[string]any),
	}
}

// ExprEnv returns the expression evaluation environment for a given item index.
func (c *PipelineContext) ExprEnv(index int) ExprEnv {
	var item any
	if index < len(c.Items) {
		item = c.Items[index]
	}
	return ExprEnv{
		Item:  item,
		Index: index,
		Args:  c.Args,
		Vars:  c.Vars,
	}
}
