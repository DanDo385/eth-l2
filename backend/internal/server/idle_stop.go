package server

import (
	"log"
	"sync"
	"time"
)

// IdleStoppable is the session surface needed by the idle-stop watchdog.
type IdleStoppable interface {
	IsActive() bool
	Stop()
}

// WatchIdleStop stops the session after grace with zero WebSocket clients.
// grace <= 0 disables the watchdog. Safe to call once at process start.
func WatchIdleStop(hub *Hub, sess IdleStoppable, grace time.Duration) {
	if grace <= 0 {
		log.Println("idle stop disabled (ETH_L2_IDLE_STOP_SECONDS <= 0)")
		return
	}

	var mu sync.Mutex
	var timer *time.Timer

	hub.SetOnClientCountChanged(func(n int) {
		mu.Lock()
		defer mu.Unlock()

		if n > 0 {
			if timer != nil {
				timer.Stop()
				timer = nil
			}
			return
		}

		if timer != nil {
			timer.Stop()
		}
		timer = time.AfterFunc(grace, func() {
			if hub.ClientCount() == 0 && sess.IsActive() {
				log.Printf("no WebSocket clients for %s; stopping idle session", grace)
				sess.Stop()
			}
		})
	})

	log.Printf("idle stop: stop session %s after last WS client disconnects", grace)
}
