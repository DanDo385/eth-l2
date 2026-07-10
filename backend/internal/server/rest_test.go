package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/dando385/eth-l2/backend/internal/engine"
	"github.com/dando385/eth-l2/backend/internal/server"
)

func newHandler(t *testing.T) http.Handler {
	t.Helper()
	sess := engine.NewSession(".")
	hub := server.NewHub()
	return server.Handler(sess, hub)
}

// ── /healthz ─────────────────────────────────────────────────────────────────

func TestHealthz_returns200(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "ok") {
		t.Fatalf("want body to contain 'ok', got %q", w.Body.String())
	}
}

// ── /health (JSON probe for portfolio / Cloudflare Tunnel) ───────────────────

func TestHealth_returnsJSON(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if ok, _ := body["ok"].(bool); !ok {
		t.Fatalf("want ok=true, got %#v", body["ok"])
	}
	if status, _ := body["status"].(string); status != "up" {
		t.Fatalf("want status=up, got %#v", body["status"])
	}
}

// ── /health/live + /health/ready ─────────────────────────────────────────────

func TestHealthLive_returnsOK(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	if w.Body.String() != "OK" {
		t.Fatalf("want body OK, got %q", w.Body.String())
	}
}

func TestHealthReady_returnsREADYOrNOT_READY(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	body := w.Body.String()
	if body != "READY" && body != "NOT_READY" {
		t.Fatalf("want READY or NOT_READY, got %q (status %d)", body, w.Code)
	}
	if body == "READY" && w.Code != http.StatusOK {
		t.Fatalf("READY must be 200, got %d", w.Code)
	}
	if body == "NOT_READY" && w.Code != http.StatusServiceUnavailable {
		t.Fatalf("NOT_READY must be 503, got %d", w.Code)
	}
}

// ── CORS ─────────────────────────────────────────────────────────────────────

func TestCORS_headersPresent(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("Access-Control-Allow-Origin: want *, got %q", got)
	}
}

func TestCORS_preflight204(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodOptions, "/api/start", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS: want 204, got %d", w.Code)
	}
}

// ── method guards ─────────────────────────────────────────────────────────────

func TestRequirePost_rejectsGet(t *testing.T) {
	for _, path := range []string{"/api/start", "/api/pause", "/api/resume", "/api/stop"} {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		w := httptest.NewRecorder()
		newHandler(t).ServeHTTP(w, r)
		if w.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s GET: want 405, got %d", path, w.Code)
		}
	}
}

func TestRequireGet_rejectsPost(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/api/state", nil)
	w := httptest.NewRecorder()
	newHandler(t).ServeHTTP(w, r)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("/api/state POST: want 405, got %d", w.Code)
	}
}

// ── /api/state when idle ──────────────────────────────────────────────────────

func TestState_idleReturnsRunningFalse(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodGet, "/api/state", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if running, _ := body["running"].(bool); running {
		t.Fatal("idle session should report running=false")
	}
}

// ── /api/pause when not running ───────────────────────────────────────────────

func TestPause_whenIdle_returns400(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodPost, "/api/pause", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}

func TestResume_whenIdle_returns400(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodPost, "/api/resume", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}

// ── /api/batch/ edge cases ────────────────────────────────────────────────────

func TestBatch_missingID_returns400(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodGet, "/api/batch/", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}

func TestBatch_invalidID_returns400(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodGet, "/api/batch/not-a-number", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}

func TestBatch_sessionIdle_returns503(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodGet, "/api/batch/42", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	// Session is idle → store is nil → 503
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d", w.Code)
	}
}

// ── /api/challenge when idle ──────────────────────────────────────────────────

func TestChallenge_sessionIdle_returns503(t *testing.T) {
	h := newHandler(t)
	body := strings.NewReader(`{"batchId":1}`)
	r := httptest.NewRequest(http.MethodPost, "/api/challenge", body)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d", w.Code)
	}
}

// ── /api/reseed bad body ──────────────────────────────────────────────────────

func TestReseed_missingBody_returns400(t *testing.T) {
	h := newHandler(t)
	r := httptest.NewRequest(http.MethodPost, "/api/reseed", strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}
