package cmd

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/agents-cc/browser-agent-extension/cli/internal/bridge"
)

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Check extension connection",
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("Checking extension connection...")

		client := bridge.NewClient(defaultWSURL, 5*time.Second)
		if err := client.Connect(); err != nil {
			fmt.Println("✗ Cannot connect to extension")
			fmt.Println("  Make sure:")
			fmt.Println("  1. Chrome extension is installed")
			fmt.Println("  2. Side panel is open")
			fmt.Println("  3. WebSocket server is running on port 3026")
			return err
		}
		defer client.Close()

		payload, err := client.Send("get_tabs", nil)
		if err != nil {
			fmt.Printf("✗ Connected but get_tabs failed: %v\n", err)
			return err
		}

		fmt.Println("✓ Connected to extension")
		if payload.Success {
			fmt.Printf("✓ get_tabs OK\n")
		}

		return nil
	},
}

func init() {
	rootCmd.AddCommand(doctorCmd)
}
