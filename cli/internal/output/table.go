package output

import (
	"fmt"
	"os"

	"github.com/jedib0t/go-pretty/v6/table"
	"github.com/jedib0t/go-pretty/v6/text"
)

// Table prints items as a formatted table.
func Table(items []any, columns []string) error {
	if len(items) == 0 {
		fmt.Println("No items found.")
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

	t := table.NewWriter()
	t.SetStyle(table.StyleRounded)
	t.SetOutputMirror(os.Stdout)

	// Header
	header := table.Row{}
	for _, col := range columns {
		header = append(header, col)
	}
	t.AppendHeader(header)

	// Rows
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			t.AppendRow(table.Row{fmt.Sprintf("%v", item)})
			continue
		}
		row := table.Row{}
		for _, col := range columns {
			row = append(row, m[col])
		}
		t.AppendRow(row)
	}

	t.SetColumnConfigs([]table.ColumnConfig{
		{Number: 1, Align: text.AlignCenter},
	})

	t.Render()
	return nil
}
