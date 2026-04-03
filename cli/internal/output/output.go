package output

import (
	"fmt"
)

// Render outputs items in the specified format.
func Render(items []any, columns []string, format string) error {
	switch format {
	case "json":
		return JSON(items)
	case "csv":
		return CSV(items, columns)
	case "table", "":
		return Table(items, columns)
	default:
		return fmt.Errorf("unknown output format: %s", format)
	}
}
