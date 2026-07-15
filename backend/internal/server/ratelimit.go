package server

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ipRateLimiter is a fixed-window per-IP limiter with idle expiry to bound memory.
type ipRateLimiter struct {
	mu          sync.Mutex
	clients     map[string]*rateClient
	readRPM     int
	mutationRPM int
	trustXFF    bool
	idleTTL     time.Duration
	lastSweep   time.Time
}

type rateClient struct {
	windowStart   time.Time
	lastSeen      time.Time
	readCount     int
	mutationCount int
}

func newIPRateLimiter(readRPM, mutationRPM int, trustXFF bool) *ipRateLimiter {
	if readRPM <= 0 {
		readRPM = defaultReadRPM
	}
	if mutationRPM <= 0 {
		mutationRPM = defaultMutationRPM
	}
	return &ipRateLimiter{
		clients:     make(map[string]*rateClient),
		readRPM:     readRPM,
		mutationRPM: mutationRPM,
		trustXFF:    trustXFF,
		idleTTL:     2 * time.Minute,
	}
}

// RetryAfterSeconds is a coarse hint for 429 responses (end of current minute window).
func (l *ipRateLimiter) RetryAfterSeconds() int {
	return 60
}

// Allow records a request for the client IP and reports whether it is within quota.
func (l *ipRateLimiter) Allow(r *http.Request, mutation bool) bool {
	ip := clientIP(r, l.trustXFF)
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	if now.Sub(l.lastSweep) > time.Minute {
		l.sweepLocked(now)
		l.lastSweep = now
	}

	c := l.clients[ip]
	if c == nil || now.Sub(c.windowStart) >= time.Minute {
		c = &rateClient{windowStart: now}
		l.clients[ip] = c
	}
	c.lastSeen = now

	if mutation {
		if c.mutationCount >= l.mutationRPM {
			return false
		}
		c.mutationCount++
		return true
	}
	if c.readCount >= l.readRPM {
		return false
	}
	c.readCount++
	return true
}

func (l *ipRateLimiter) sweepLocked(now time.Time) {
	for ip, c := range l.clients {
		if now.Sub(c.lastSeen) > l.idleTTL {
			delete(l.clients, ip)
		}
	}
}

func clientIP(r *http.Request, trustXFF bool) string {
	if trustXFF {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			if ip := strings.TrimSpace(parts[0]); ip != "" {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
