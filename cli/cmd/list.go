package cmd

import (
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"github.com/mobai/browser-agent-cli/internal/adapter"
)

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List available adapters",
	RunE: func(cmd *cobra.Command, args []string) error {
		files, err := adapter.Discover()
		if err != nil || len(files) == 0 {
			fmt.Println("No adapters found. Place *.yaml files in adapters/ or ~/.bae/adapters/")
			return nil
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "FILE\tSITE\tNAME\tDESCRIPTION")
		for _, f := range files {
			cfg, err := adapter.Parse(f)
			if err != nil {
				fmt.Fprintf(w, "%s\t(error)\t\t%s\n", f, err)
				continue
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", f, cfg.Site, cfg.Name, cfg.Description)
		}
		return w.Flush()
	},
}

func init() {
	rootCmd.AddCommand(listCmd)
}
