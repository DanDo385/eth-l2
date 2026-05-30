package server

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/dando385/eth-l2/backend/internal/engine"
)

// Handler builds an http.ServeMux wired to the session and hub.
func Handler(sess *engine.Session, hub *Hub) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok\n"))
	})

	mux.HandleFunc("/stream", hub.ServeWS)

	mux.HandleFunc("/api/start", requirePost(handleStart(sess)))
	mux.HandleFunc("/api/pause", requirePost(handlePause(sess)))
	mux.HandleFunc("/api/resume", requirePost(handleResume(sess)))
	mux.HandleFunc("/api/stop", requirePost(handleStop(sess)))
	mux.HandleFunc("/api/reseed", requirePost(handleReseed(sess)))
	mux.HandleFunc("/api/challenge", requirePost(handleChallenge(sess)))
	mux.HandleFunc("/api/state", requireGet(handleState(sess)))
	mux.HandleFunc("/api/batch/", requireGet(handleBatch(sess)))

	return cors(mux)
}

func handleStart(sess *engine.Session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Seed  uint64 `json:"seed"`
			Speed int    `json:"speed"`
		}
		body.Seed = 42
		body.Speed = 1
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Speed < 1 {
			body.Speed = 1
		}
		if err := sess.Start(r.Context(), body.Seed, body.Speed); err != nil {
			// Idempotent UX: frontends may retry start while session is already active.
			if strings.Contains(err.Error(), "already active") {
				writeJSON(w, map[string]string{"status": "running"})
				return
			}
			httpError(w, err.Error(), http.StatusConflict)
			return
		}
		writeJSON(w, map[string]string{"status": "started"})
	}
}

func handlePause(sess *engine.Session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := sess.Pause(); err != nil {
			httpError(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]string{"status": "paused"})
	}
}

func handleResume(sess *engine.Session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := sess.Resume(); err != nil {
			httpError(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]string{"status": "running"})
	}
}

func handleStop(sess *engine.Session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sess.Stop()
		writeJSON(w, map[string]string{"status": "stopped"})
	}
}

func handleReseed(sess *engine.Session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Seed uint64 `json:"seed"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Seed == 0 {
			httpError(w, "seed required", http.StatusBadRequest)
			return
		}
		if err := sess.Reseed(r.Context(), body.Seed); err != nil {
			httpError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]string{"status": "reseeded"})
	}
}

func handleChallenge(sess *engine.Session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			BatchID uint64 `json:"batchId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			httpError(w, "batchId required", http.StatusBadRequest)
			return
		}
		ch := sess.Challenger()
		if ch == nil {
			httpError(w, "session not running", http.StatusServiceUnavailable)
			return
		}
		go func() {
			if err := ch.Challenge(r.Context(), body.BatchID); err != nil {
				// Non-fatal: error surfaced via logs
				_ = err
			}
		}()
		writeJSON(w, map[string]string{"status": "challenge initiated"})
	}
}

func handleState(sess *engine.Session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		st := sess.Store()
		if st == nil {
			writeJSON(w, map[string]any{"running": false, "paused": false, "batches": []any{}, "blocks": map[string]int{}})
			return
		}
		writeJSON(w, st.Snapshot())
	}
}

func handleBatch(sess *engine.Session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Path: /api/batch/{id}
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/batch/"), "/")
		if len(parts) == 0 || parts[0] == "" {
			httpError(w, "batch id required", http.StatusBadRequest)
			return
		}
		id, err := strconv.ParseUint(parts[0], 10, 64)
		if err != nil {
			httpError(w, "invalid batch id", http.StatusBadRequest)
			return
		}
		st := sess.Store()
		if st == nil {
			httpError(w, "session not running", http.StatusServiceUnavailable)
			return
		}
		batch := st.GetBatch(id)
		if batch == nil {
			httpError(w, "batch not found", http.StatusNotFound)
			return
		}
		writeJSON(w, batch)
	}
}

func requirePost(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h(w, r)
	}
}

func requireGet(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h(w, r)
	}
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func httpError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
