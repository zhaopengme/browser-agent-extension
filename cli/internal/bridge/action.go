package bridge

// ActionMap maps pipeline step names to extension action names.
var ActionMap = map[string]string{
	"navigate":  "navigate",
	"click":     "click",
	"type":      "type",
	"wait":      "wait_for_selector",
	"evaluate":  "evaluate",
	"intercept": "enable_network",
	"download":  "download",
}

// MapAction returns the extension action name for a pipeline step.
func MapAction(stepName string) string {
	if action, ok := ActionMap[stepName]; ok {
		return action
	}
	return stepName
}

// BuildParams builds params for a given action and step data.
func BuildParams(action string, stepData map[string]any) map[string]any {
	params := make(map[string]any)
	for k, v := range stepData {
		params[k] = v
	}

	// Special handling for wait step
	if action == "wait_for_selector" {
		if _, hasTimeout := params["timeout"]; !hasTimeout {
			params["visible"] = true
		}
	}

	return params
}
