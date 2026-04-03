package output

import (
	"encoding/csv"
	"fmt"
	"os"
)

// CSV prints items as CSV.
func CSV(items []any, columns []string) error {
	if len(items) == 0 {
		return nil
	}

	// Auto-detect columns if not provided
	if len(columns) == 0 {
		if m, ok := items[0].(map[string]any); ok {
			for k := range m {
				columns = append(columns, k)
			}
		}
	}

	w := csv.NewWriter(os.Stdout)
	defer w.Flush()

	// Header
	if err := w.Write(columns); err != nil {
		return fmt.Errorf("write csv header: %w", err)
	}

	// Rows
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			w.Write([]string{fmt.Sprintf("%v", item)})
			continue
		}
		var row []string
		for _, col := range columns {
			row = append(row, fmt.Sprintf("%v", m[col]))
		}
		if err := w.Write(row); err != nil {
			return fmt.Errorf("write csv row: %w", err)
		}
	}

	return nil
}
