package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/dando385/eth-l2/backend/internal/engine"
	"github.com/dando385/eth-l2/backend/internal/server"
)

func main() {
	repoRoot := findRepoRoot()
	log.Printf("repo root: %s", repoRoot)

	sess := engine.NewSession(repoRoot)
	hub := server.NewHub()

	// Fan events from the active session bus to all WebSocket clients.
	// Re-subscribed whenever the session starts/stops via the Bus() accessor.
	go func() {
		// Simple approach: poll for an active bus and run until context done.
		// The bus changes on Start/Stop, so we re-run Hub.Run each session.
		// A production system would use an observer; for the demo this is fine.
		for {
			bus := sess.Bus()
			if bus != nil {
				// Run blocks until ctx is done or bus closes.
				hub.Run(context.Background(), bus)
			}
		}
	}()

	srv := &http.Server{
		Addr:    ":8080",
		Handler: server.Handler(sess, hub),
	}

	go func() {
		log.Println("HTTP server listening on :8080")
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
