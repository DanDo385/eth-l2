package server

import (
	"crypto/subtle"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gorilla/websocket"
)

// WSBearerProtocolPrefix is the WebSocket subprotocol prefix used to carry an
// API token without putting credentials in the URL.
//
// Browser usage:
//
//	const ws = new WebSocket(WS_URL, [`eth-l2.bearer.${token}`]);
//
// The token must come from a secret manager / server injection — never from
// committed frontend JavaScript.
const WSBearerProtocolPrefix = "eth-l2.bearer."

const (
	defaultReadRPM     = 60
	defaultMutationRPM = 10
)

// SecurityConfig holds defense-in-depth settings for the HTTP API.
type SecurityConfig struct {
	APIToken           string
	AllowedOrigins     map[string]struct{}
	TrustXForwardedFor bool
	ReadRPM            int
	MutationRPM        int
}

// LoadSecurityConfig reads security settings from the environment.
func LoadSecurityConfig() SecurityConfig {
	cfg := SecurityConfig{
		APIToken:           strings.TrimSpace(os.Getenv("ETH_L2_API_TOKEN")),
		AllowedOrigins:     parseAllowedOrigins(os.Getenv("ETH_L2_ALLOWED_ORIGINS")),
		TrustXForwardedFor: envTruthy("ETH_L2_TRUST_X_FORWARDED_FOR"),
		ReadRPM:            envIntPositive("ETH_L2_RATE_LIMIT_READ", defaultReadRPM),
		MutationRPM:        envIntPositive("ETH_L2_RATE_LIMIT_MUTATION", defaultMutationRPM),
	}
	return cfg
}

func parseAllowedOrigins(raw string) map[string]struct{} {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	set := make(map[string]struct{})
	for _, o := range strings.Split(raw, ",") {
		if o = strings.TrimSpace(o); o != "" {
			set[o] = struct{}{}
		}
	}
	if len(set) == 0 {
		return nil
	}
	return set
}

func envTruthy(key string) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func envIntPositive(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func logAuthDisabledWarning(cfg SecurityConfig) {
	if cfg.APIToken == "" {
		log.Println("WARNING: ETH_L2_API_TOKEN unset; mutation and WebSocket authentication disabled")
	}
}

func tokenEqual(got, want string) bool {
	if want == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}

// extractAPIToken returns a bearer token from Authorization or from the
// eth-l2.bearer.* WebSocket subprotocol. Query parameters are never accepted.
func extractAPIToken(r *http.Request) string {
	if auth := r.Header.Get("Authorization"); auth != "" {
		const prefix = "Bearer "
		if len(auth) >= len(prefix) && strings.EqualFold(auth[:len(prefix)], prefix) {
			return strings.TrimSpace(auth[len(prefix):])
		}
	}
	for _, p := range websocket.Subprotocols(r) {
		if strings.HasPrefix(p, WSBearerProtocolPrefix) {
			return strings.TrimPrefix(p, WSBearerProtocolPrefix)
		}
	}
	return ""
}

func selectedWSBearerProtocol(r *http.Request) string {
	for _, p := range websocket.Subprotocols(r) {
		if strings.HasPrefix(p, WSBearerProtocolPrefix) {
			return p
		}
	}
	return ""
}

func requireAPIToken(cfg SecurityConfig, r *http.Request) bool {
	if cfg.APIToken == "" {
		return true
	}
	return tokenEqual(extractAPIToken(r), cfg.APIToken)
}

func originPermitted(cfg SecurityConfig, r *http.Request) bool {
	if cfg.AllowedOrigins == nil {
		return true
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		// No Origin: curl / server-to-server / same-origin navigations.
		return true
	}
	_, ok := cfg.AllowedOrigins[origin]
	return ok
}

func isHealthPath(path string) bool {
	switch path {
	case "/health", "/health/live", "/health/ready", "/healthz":
		return true
	default:
		return false
	}
}

func isMutationRequest(r *http.Request) bool {
	if r.URL.Path == "/stream" {
		return true
	}
	return r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/")
}

func needsAPIToken(r *http.Request) bool {
	if r.URL.Path == "/stream" {
		return true
	}
	return r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/")
}

func needsOriginGate(r *http.Request) bool {
	if isHealthPath(r.URL.Path) {
		return false
	}
	return r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/")
}

// wrapSecurity applies CORS, rate limiting, origin gates, and API-token checks.
func wrapSecurity(cfg SecurityConfig, limiter *ipRateLimiter, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		applyCORS(w, r, cfg)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		if !limiter.Allow(r, isMutationRequest(r)) {
			retry := limiter.RetryAfterSeconds()
			w.Header().Set("Retry-After", strconv.Itoa(retry))
			httpError(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}

		if isHealthPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		if needsOriginGate(r) && !originPermitted(cfg, r) {
			httpError(w, "origin not allowed", http.StatusForbidden)
			return
		}

		if needsAPIToken(r) && !requireAPIToken(cfg, r) {
			httpError(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func applyCORS(w http.ResponseWriter, r *http.Request, cfg SecurityConfig) {
	if cfg.AllowedOrigins == nil {
		w.Header().Set("Access-Control-Allow-Origin", "*")
	} else if origin := r.Header.Get("Origin"); origin != "" {
		if _, ok := cfg.AllowedOrigins[origin]; ok {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
		}
	}
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

func checkOrigin(cfg SecurityConfig) func(*http.Request) bool {
	return func(r *http.Request) bool {
		return originPermitted(cfg, r)
	}
}
