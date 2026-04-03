package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/mobai/browser-agent-cli/internal/adapter"
)

var showCmd = &cobra.Command{
	Use:   "show <adapter.yaml>",
	Short: "Show adapter details",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := adapter.Parse(args[0])
		if err != nil {
			return fmt.Errorf("parse adapter: %w", err)
		}

		fmt.Printf("Site:        %s\n", cfg.Site)
		fmt.Printf("Name:        %s\n", cfg.Name)
		fmt.Printf("Description: %s\n", cfg.Description)
		fmt.Printf("Strategy:    %s\n", cfg.Strategy)
		fmt.Printf("Steps:       %d\n", len(cfg.Pipeline))
		if len(cfg.Columns) > 0 {
			fmt.Printf("Columns:     %v\n", cfg.Columns)
		}
		if len(cfg.Args) > 0 {
			fmt.Println("Arguments:")
			for name, arg := range cfg.Args {
				fmt.Printf("  %-15s type=%s default=%v  %s\n", name, arg.Type, arg.Default, arg.Description)
			}
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(showCmd)
}
