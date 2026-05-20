package engine

import (
	"testing"
)

// TestSessionInitialState verifies a new session starts idle with no live components.
func TestSessionInitialState(t *testing.T) {
	sess := NewSession("/repo")
	if sess.st != stateIdle {
		t.Errorf("expected stateIdle, got %v", sess.st)
	}
	if sess.bus != nil {
		t.Error("bus should be nil before Start")
	}
	if sess.batchStore != nil {
		t.Error("batchStore should be nil before Start")
	}
}

// TestSessionPause_requiresRunning verifies Pause fails when idle.
func TestSessionPause_requiresRunning(t *testing.T) {
	sess := NewSession("/repo")
	if err := sess.Pause(); err == nil {
		t.Error("Pause on idle session should return an error")
	}
}

// TestSessionResume_requiresPaused verifies Resume fails when idle.
func TestSessionResume_requiresPaused(t *testing.T) {
	sess := NewSession("/repo")
	if err := sess.Resume(); err == nil {
		t.Error("Resume on idle session should return an error")
	}
}

// TestSessionStop_idempotent verifies Stop on an idle session does not panic.
func TestSessionStop_idempotent(t *testing.T) {
	sess := NewSession("/repo")
	sess.Stop() // should not panic
}

// TestSessionPauseResume_stateTransitions exercises the pause/resume state machine
// by directly manipulating state (bypassing chain startup).
func TestSessionPauseResume_stateTransitions(t *testing.T) {
	sess := NewSession("/repo")
	sess.st = stateRunning // simulate a running session

	if err := sess.Pause(); err != nil {
		t.Fatalf("Pause should succeed when running: %v", err)
	}
	if sess.st != statePaused {
		t.Errorf("expected statePaused, got %v", sess.st)
	}

	if err := sess.Resume(); err != nil {
		t.Fatalf("Resume should succeed when paused: %v", err)
	}
	if sess.st != stateRunning {
		t.Errorf("expected stateRunning after Resume, got %v", sess.st)
	}
}

// TestSessionPause_whenAlreadyPaused returns an error (not running).
func TestSessionPause_whenAlreadyPaused(t *testing.T) {
	sess := NewSession("/repo")
	sess.st = statePaused
	if err := sess.Pause(); err == nil {
		t.Error("double-Pause should return an error")
	}
}

// TestSessionResume_whenAlreadyRunning returns an error (not paused).
func TestSessionResume_whenAlreadyRunning(t *testing.T) {
	sess := NewSession("/repo")
	sess.st = stateRunning
	if err := sess.Resume(); err == nil {
		t.Error("Resume on running session should return an error")
	}
}

// TestSessionAccessors_nilBeforeStart verifies all component accessors return nil before Start.
func TestSessionAccessors_nilBeforeStart(t *testing.T) {
	sess := NewSession("/repo")
	if sess.Bus() != nil {
		t.Error("Bus() should be nil before Start")
	}
	if sess.Store() != nil {
		t.Error("Store() should be nil before Start")
	}
	if sess.Challenger() != nil {
		t.Error("Challenger() should be nil before Start")
	}
	if sess.L1Addrs() != nil {
		t.Error("L1Addrs() should be nil before Start")
	}
	if sess.L2Addrs("op-l2") != nil {
		t.Error("L2Addrs() should be nil before Start")
	}
	if sess.Client("l1") != nil {
		t.Error("Client() should be nil before Start")
	}
}

// TestSessionTeardown_resetsState verifies teardown resets all fields.
func TestSessionTeardown_resetsState(t *testing.T) {
	sess := NewSession("/repo")
	// Simulate a partially-initialised session.
	sess.st = stateRunning
	sess.teardown()

	// After teardown, compound collections should be reset, not nil.
	if sess.clients == nil {
		t.Error("clients map should be re-initialised by teardown, not nil")
	}
	if sess.l2Addrs == nil {
		t.Error("l2Addrs map should be re-initialised by teardown, not nil")
	}
	// Pointers should be nil.
	if sess.bus != nil {
		t.Error("bus should be nil after teardown")
	}
	if sess.batchStore != nil {
		t.Error("batchStore should be nil after teardown")
	}
}
