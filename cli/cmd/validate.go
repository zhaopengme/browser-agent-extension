package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/agents-cc/browser-agent-extension/cli/internal/adapter"
)

var validateCmd = &cobra.Command{
	Use:   "validate <adapter.yaml>",
	Short: "Validate adapter syntax",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		_, err := adapter.Parse(args[0])
		if err != nil {
			return fmt.Errorf("validation failed: %w", err)
		}
		fmt.Println("✓ Adapter is valid")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(validateCmd)
}
