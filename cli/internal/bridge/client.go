package bridge

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// BridgeRequest is the wire format sent to the extension.
type BridgeRequest struct {
	Type   string         `json:"type"`
	ID     string         `json:"id"`
	Action string         `json:"action"`
	Params map[string]any `json:"params"`
}

// BridgeResponse is the wire format received from the extension.
type BridgeResponse struct {
	Type    string        `json:"type"`
	ID      string        `json:"id"`
	Payload BridgePayload `json:"payload"`
}

// BridgePayload is the inner response payload.
type BridgePayload struct {
	Success bool   `json:"success"`
	Data    any    `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
}

// Client manages a WebSocket connection to the extension.
type Client struct {
	url     string
	timeout time.Duration
	conn    *websocket.Conn
	mu      sync.Mutex
	pending map[string]chan BridgeResponse
}

// NewClient creates a new bridge client.
func NewClient(url string, timeout time.Duration) *Client {
	return &Client{
		url:     url,
		timeout: timeout,
		pending: make(map[string]chan BridgeResponse),
	}
}

// Connect establishes the WebSocket connection.
func (c *Client) Connect() error {
	conn, _, err := websocket.DefaultDialer.Dial(c.url, nil)
	if err != nil {
		return fmt.Errorf("connect to %s: %w", c.url, err)
	}
	c.conn = conn

	// Start read loop
	go c.readLoop()

	return nil
}

// Close closes the WebSocket connection.
func (c *Client) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// Send sends a request and waits for the matching response.
func (c *Client) Send(action string, params map[string]any) (*BridgePayload, error) {
	id := fmt.Sprintf("req_%d", time.Now().UnixNano())

	// Create response channel
	respCh := make(chan BridgeResponse, 1)
	c.mu.Lock()
	c.pending[id] = respCh
	c.mu.Unlock()

	// Send request
	req := BridgeRequest{
		Type:   "REQUEST",
		ID:     id,
		Action: action,
		Params: params,
	}

	if err := c.conn.WriteJSON(req); err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}

	// Wait for response
	select {
	case resp := <-respCh:
		return &resp.Payload, nil
	case <-time.After(c.timeout):
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, fmt.Errorf("timeout waiting for response (action=%s, timeout=%s)", action, c.timeout)
	}
}

// readLoop reads messages from the WebSocket connection.
func (c *Client) readLoop() {
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			// Connection closed — drain pending
			c.mu.Lock()
			for _, ch := range c.pending {
				select {
				case ch <- BridgeResponse{Payload: BridgePayload{Success: false, Error: "connection closed"}}:
				default:
				}
			}
			c.mu.Unlock()
			return
		}

		var resp BridgeResponse
		if err := json.Unmarshal(msg, &resp); err != nil {
			continue // skip malformed messages
		}

		// Route to pending request
		c.mu.Lock()
		if ch, ok := c.pending[resp.ID]; ok {
			delete(c.pending, resp.ID)
			select {
			case ch <- resp:
			default:
			}
		}
		c.mu.Unlock()
	}
}
