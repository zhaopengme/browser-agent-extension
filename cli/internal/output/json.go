package output

import (
	"encoding/json"
	"os"
)

// JSON prints items as JSON.
func JSON(items []any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(items)
}
