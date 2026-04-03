package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

const (
	version      = "dev"
	defaultWSURL = "ws://localhost:3026/ws"
)

var rootCmd = &cobra.Command{
	Use:     "bae",
	Short:   "Browser Agent Extension CLI — YAML-driven pipeline engine for web data extraction",
	Long: `bae executes YAML-defined pipelines to extract structured data from websites,
powered by the Browser Agent Extension as the browser backend.`,
	Version: version,
	SilenceUsage: true,
}

// Execute runs the CLI.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
