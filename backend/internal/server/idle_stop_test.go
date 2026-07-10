package server

import (
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type fakeSession struct {
	active atomic.Bool
	stops  atomic.Int32
}

func (s *fakeSession) IsActive() bool { return s.active.Load() }
func (s *fakeSession) Stop() {
	s.stops.Add(1)
	s.active.Store(false)
}

func TestWatchIdleStop_stopsAfterLastClient(t *testing.T) {
	hub := NewHub()
	sess := &fakeSession{}
	sess.active.Store(true)

	WatchIdleStop(hub, sess, 50*time.Millisecond)

	c1 := &websocket.Conn{}
	c2 := &websocket.Conn{}
	hub.addClient(c1)
	hub.addClient(c2)
	if hub.ClientCount() != 2 {
		t.Fatalf("want 2 clients, got %d", hub.ClientCount())
	}

	hub.removeClient(c1)
	time.Sleep(80 * time.Millisecond)
	if sess.stops.Load() != 0 {
		t.Fatal("must not stop while a client remains")
	}

	hub.removeClient(c2)
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if sess.stops.Load() == 1 && !sess.IsActive() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("expected idle stop after last client; stops=%d active=%v", sess.stops.Load(), sess.IsActive())
}

func TestWatchIdleStop_reconnectCancels(t *testing.T) {
	hub := NewHub()
	sess := &fakeSession{}
	sess.active.Store(true)

	WatchIdleStop(hub, sess, 80*time.Millisecond)

	c := &websocket.Conn{}
	hub.addClient(c)
	hub.removeClient(c)
	time.Sleep(20 * time.Millisecond)
	hub.addClient(c) // reconnect before grace elapses

	time.Sleep(120 * time.Millisecond)
	if sess.stops.Load() != 0 {
		t.Fatal("reconnect within grace must cancel idle stop")
	}
	hub.removeClient(c)
}

func TestWatchIdleStop_disabled(t *testing.T) {
	hub := NewHub()
	sess := &fakeSession{}
	sess.active.Store(true)
	WatchIdleStop(hub, sess, 0)
	c := &websocket.Conn{}
	hub.addClient(c)
	hub.removeClient(c)
	time.Sleep(30 * time.Millisecond)
	if sess.stops.Load() != 0 {
		t.Fatal("grace<=0 must disable idle stop")
	}
}
