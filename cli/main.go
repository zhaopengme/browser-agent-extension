package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	version = "dev"
	verbose bool
)

var rootCmd = &cobra.Command{
	Use:   "bae",
	Short: "Browser Agent Extension CLI — YAML-driven pipeline engine for web data extraction",
	Long: `bae executes YAML-defined pipelines to extract structured data from websites,
powered by the Browser Agent Extension as the browser backend.`,
	SilenceUsage: true,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Verbose logging")
}

func main() {
	Execute()
}
