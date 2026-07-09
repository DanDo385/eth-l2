package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/config"
	"github.com/dando385/eth-l2/backend/internal/engine"
	"github.com/dando385/eth-l2/backend/internal/events"
	"github.com/dando385/eth-l2/backend/internal/server"
)

func main() {
	repoRoot := findRepoRoot()
	log.Printf("repo root: %s", repoRoot)

	if err := chain.InitChainsFromConfig(repoRoot); err != nil {
		log.Fatalf("ports config: %v", err)
	}

	sess := engine.NewSession(repoRoot)
	hub := server.NewHub()

	// Fan events from the active session bus to all WebSocket clients.
	go func() {
		var runCancel context.CancelFunc
		var activeBus *events.Bus
		for {
			bus := sess.Bus()
			if bus == nil {
				if runCancel != nil {
					runCancel()
					runCancel = nil
					activeBus = nil
				}
				time.Sleep(50 * time.Millisecond)
				continue
			}
			if bus == activeBus {
				time.Sleep(50 * time.Millisecond)
				continue
			}
			if runCancel != nil {
				runCancel()
			}
			ctx, cancel := context.WithCancel(context.Background())
			runCancel = cancel
			activeBus = bus
			go hub.Run(ctx, bus)
		}
	}()

	srv := &http.Server{
		Addr:    resolveAddr(repoRoot),
		Handler: server.Handler(sess, hub),
	}

	go func() {
		log.Printf("HTTP server listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down...")
	_ = srv.Shutdown(context.Background())
	sess.Stop()
}

// resolveAddr returns the HTTP bind address.
// Priority: GOAPI_ADDR (full host:port) > PORT (loopback:port) > config/ports.json.
// Default is 127.0.0.1 so the API is not exposed on LAN; Cloudflare Tunnel
// reaches it via localhost on the MacBook.
func resolveAddr(repoRoot string) string {
	if addr := os.Getenv("GOAPI_ADDR"); addr != "" {
		return addr
	}
	if port := os.Getenv("PORT"); port != "" {
		return "127.0.0.1:" + port
	}
	if p, err := config.Load(repoRoot); err == nil {
		return p.BackendListenAddr()
	}
	return "127.0.0.1:8080"
}

// findRepoRoot walks up from cwd until it finds foundry.toml.
func findRepoRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "foundry.toml")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			log.Fatal("could not find repo root (no foundry.toml); run from within the eth-l2 repo")
		}
		dir = parent
	}
}
