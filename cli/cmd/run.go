package cmd

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/agents-cc/browser-agent-extension/cli/internal/adapter"
	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
	"github.com/agents-cc/browser-agent-extension/cli/internal/output"
	"github.com/agents-cc/browser-agent-extension/cli/internal/pipeline"
)

var (
	outputFormat string
	stepTimeout  time.Duration
)

var runCmd = &cobra.Command{
	Use:   "run <adapter.yaml>",
	Short: "Execute an adapter pipeline",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := adapter.Parse(args[0])
		if err != nil {
			return fmt.Errorf("parse adapter: %w", err)
		}

		// Populate context args from adapter defaults
		ctxArgs := make(map[string]any)
		for name, arg := range cfg.Args {
			ctxArgs[name] = arg.Default
		}

		// Skip WebSocket connection for public-only adapters
		if cfg.Browser || cfg.Strategy != "public" {
			client := bridge.NewClient(defaultWSURL, stepTimeout)
			if err := client.Connect(); err != nil {
				return fmt.Errorf("connect to extension: %w\nHint: make sure the Chrome extension is running", err)
			}
			defer client.Close()

			ctx := pipeline.NewContext(ctxArgs)
			items, err := pipeline.RunPipeline(ctx, cfg, client)
			if err != nil {
				return fmt.Errorf("pipeline: %w", err)
			}
			return output.Render(items, cfg.Columns, outputFormat)
		}

		// Public-only: no extension needed
		ctx := pipeline.NewContext(ctxArgs)
		items, err := pipeline.RunPipeline(ctx, cfg, nil)
		if err != nil {
			return fmt.Errorf("pipeline: %w", err)
		}
		return output.Render(items, cfg.Columns, outputFormat)
	},
}

func init() {
	runCmd.Flags().StringVarP(&outputFormat, "output", "o", "table", "Output format (table|json|csv)")
	runCmd.Flags().DurationVar(&stepTimeout, "timeout", 30*time.Second, "Per-step timeout")
	rootCmd.AddCommand(runCmd)
}
