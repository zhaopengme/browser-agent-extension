package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
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
	Use:   "run <adapter.yaml|site/name> [args...]",
	Short: "Execute an adapter pipeline",
	Args:  cobra.MinimumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		adapterPath := args[0]

		// Resolve site/name shorthand to file path
		if !strings.Contains(adapterPath, ".yaml") && !strings.Contains(adapterPath, "/") {
			// Single word — try adapters/<word>/*.yaml, but error if ambiguous
			adapterPath = findAdapter(adapterPath)
			if adapterPath == "" {
				return fmt.Errorf("adapter %q not found. Use full path (e.g., adapters/site/name.yaml)", args[0])
			}
		} else if !strings.HasSuffix(adapterPath, ".yaml") {
			// site/name → adapters/site/name.yaml
			parts := strings.SplitN(adapterPath, "/", 2)
			if len(parts) == 2 {
				adapterPath = filepath.Join("adapters", parts[0], parts[1]+".yaml")
			}
		}

		cfg, err := adapter.Parse(adapterPath)
		if err != nil {
			return fmt.Errorf("parse adapter: %w", err)
		}

		// Populate context args from adapter defaults
		ctxArgs := make(map[string]any)
		for name, arg := range cfg.Args {
			ctxArgs[name] = arg.Default
		}

		// Override with positional args (args[1:] are values for positional args)
		positionalIdx := 0
		for _, name := range positionalArgNames(cfg.Args) {
			if positionalIdx < len(args)-1 {
				val := args[positionalIdx+1]
				ctxArgs[name] = coerceArgType(val, cfg.Args[name])
				positionalIdx++
			}
		}

		// Override with explicit flags (--key=value via cobra)
		flagArgs, _ := cmd.Flags().GetStringArray("set")
		for _, kv := range flagArgs {
			parts := strings.SplitN(kv, "=", 2)
			if len(parts) == 2 {
				if argDef, ok := cfg.Args[parts[0]]; ok {
					ctxArgs[parts[0]] = coerceArgType(parts[1], argDef)
				} else {
					ctxArgs[parts[0]] = parts[1]
				}
			}
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

func findAdapter(name string) string {
	dir := filepath.Join("adapters", name)
	files, _ := yamlFiles(dir)
	if len(files) == 1 {
		return files[0]
	}
	// Try adapters/*/<name>.yaml
	rootDir := "adapters"
	entries, _ := os.ReadDir(rootDir)
	for _, e := range entries {
		if e.IsDir() {
			path := filepath.Join(rootDir, e.Name(), name+".yaml")
			if _, err := os.Stat(path); err == nil {
				return path
			}
		}
	}
	return ""
}

func yamlFiles(dir string) ([]string, error) {
	var files []string
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(d.Name(), ".yaml") {
			files = append(files, path)
		}
		return nil
	})
	return files, err
}

func positionalArgNames(args map[string]adapter.Arg) []string {
	var names []string
	for name, arg := range args {
		if arg.Positional {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names
}

func coerceArgType(val string, arg adapter.Arg) any {
	switch arg.Type {
	case "int":
		if n, err := strconv.Atoi(val); err == nil {
			return n
		}
	case "bool":
		if val == "true" || val == "1" {
			return true
		}
		if val == "false" || val == "0" {
			return false
		}
	}
	return val
}

func init() {
	runCmd.Flags().StringVarP(&outputFormat, "output", "o", "table", "Output format (table|json|csv)")
	runCmd.Flags().DurationVar(&stepTimeout, "timeout", 30*time.Second, "Per-step timeout")
	runCmd.Flags().StringArrayP("set", "s", nil, "Set adapter argument (key=value)")
	rootCmd.AddCommand(runCmd)
}
