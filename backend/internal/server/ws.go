package server

import (
	"context"
	"log"
	"net/http"
	"sync"

	"github.com/dando385/eth-l2/backend/internal/events"
	"github.com/gorilla/websocket"
)

// Hub fans out bus events to all connected WebSocket clients.
type Hub struct {
	mu          sync.RWMutex
	clients     map[*websocket.Conn]struct{}
	onCount     func(n int)
	checkOrigin func(*http.Request) bool
}

func NewHub() *Hub {
	return &Hub{clients: make(map[*websocket.Conn]struct{})}
}

// SetCheckOrigin configures the WebSocket origin check (defaults to allow all).
func (h *Hub) SetCheckOrigin(fn func(*http.Request) bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.checkOrigin = fn
}

// SetOnClientCountChanged registers a callback invoked after connect/disconnect
// with the current client count. Used to idle-stop the session when nobody is watching.
func (h *Hub) SetOnClientCountChanged(fn func(n int)) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.onCount = fn
}

// ClientCount returns the number of connected WebSocket clients.
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (h *Hub) addClient(conn *websocket.Conn) {
	h.mu.Lock()
	h.clients[conn] = struct{}{}
	n := len(h.clients)
	cb := h.onCount
	h.mu.Unlock()
	if cb != nil {
		cb(n)
	}
}

func (h *Hub) removeClient(conn *websocket.Conn) {
	h.mu.Lock()
	delete(h.clients, conn)
	n := len(h.clients)
	cb := h.onCount
	h.mu.Unlock()
	if cb != nil {
		cb(n)
	}
}

// Run subscribes to bus events and broadcasts them until ctx is canceled.
// Call in a goroutine; re-call with the new bus each time the session restarts.
func (h *Hub) Run(ctx context.Context, bus *events.Bus) {
	if bus == nil {
		return
	}
	ch, unsub := bus.Subscribe(256)
	defer unsub()
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			h.broadcast(ev)
		}
	}
}

func (h *Hub) broadcast(ev events.Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for conn := range h.clients {
		if err := conn.WriteJSON(ev); err != nil {
			log.Printf("ws write: %v", err)
		}
	}
}

// ServeWS upgrades the request and registers the connection.
// When the client offers eth-l2.bearer.<token>, that subprotocol is selected so
// browsers can authenticate without putting credentials in the URL.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	checkOrigin := h.checkOrigin
	h.mu.RUnlock()
	if checkOrigin == nil {
		checkOrigin = func(*http.Request) bool { return true }
	}

	upgrader := websocket.Upgrader{CheckOrigin: checkOrigin}

	var respHeader http.Header
	if proto := selectedWSBearerProtocol(r); proto != "" {
		respHeader = http.Header{}
		respHeader.Set("Sec-WebSocket-Protocol", proto)
	}

	conn, err := upgrader.Upgrade(w, r, respHeader)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}

	h.addClient(conn)
	defer func() {
		h.removeClient(conn)
		conn.Close()
	}()

	// Read pump — keeps the connection alive and detects disconnects.
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}
