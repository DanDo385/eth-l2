package events_test

import (
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/dando385/eth-l2/backend/internal/events"
)

func TestNew_marshalsPayload(t *testing.T) {
	ev := events.New(events.BlockMined, events.BlockMinedPayload{Chain: "l1", BlockNum: 7})
	if ev.Type != events.BlockMined {
		t.Fatalf("type: want %q, got %q", events.BlockMined, ev.Type)
	}
	var p events.BlockMinedPayload
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if p.Chain != "l1" || p.BlockNum != 7 {
		t.Fatalf("payload: got %+v", p)
	}
}

func TestBus_subscriberReceivesPublished(t *testing.T) {
	bus := events.NewBus()
	ch, unsub := bus.Subscribe(4)
	defer unsub()

	bus.Publish(events.New(events.BlockMined, events.BlockMinedPayload{Chain: "l1", BlockNum: 1}))

	select {
	case ev := <-ch:
		if ev.Type != events.BlockMined {
			t.Fatalf("unexpected type %q", ev.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout: no event received")
	}
}

func TestBus_multipleSubscribers(t *testing.T) {
	bus := events.NewBus()
	ch1, unsub1 := bus.Subscribe(4)
	ch2, unsub2 := bus.Subscribe(4)
	defer unsub1()
	defer unsub2()

	bus.Publish(events.New(events.BatchFlagged, events.BatchFlaggedPayload{BatchID: 3}))

	for _, ch := range []<-chan events.Event{ch1, ch2} {
		select {
		case ev := <-ch:
			if ev.Type != events.BatchFlagged {
				t.Fatalf("unexpected type %q", ev.Type)
			}
		case <-time.After(time.Second):
			t.Fatal("timeout: subscriber did not receive event")
		}
	}
}

func TestBus_unsubscribeClosesChannel(t *testing.T) {
	bus := events.NewBus()
	ch, unsub := bus.Subscribe(4)
	unsub()

	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("channel should be closed")
		}
	case <-time.After(time.Second):
		t.Fatal("timeout: channel not closed after unsub")
	}
}

func TestBus_slowSubscriberDoesNotBlock(t *testing.T) {
	bus := events.NewBus()
	// Subscribe with buffer=0 so any publish would block if we weren't using select
	ch, unsub := bus.Subscribe(0)
	defer func() {
		unsub()
		// drain so unsub's close doesn't panic
		for range ch {
		}
	}()

	done := make(chan struct{})
	go func() {
		// Publish many events; none should block the goroutine.
		for i := 0; i < 20; i++ {
			bus.Publish(events.New(events.BlockMined, events.BlockMinedPayload{Chain: "l1", BlockNum: uint64(i)}))
		}
		close(done)
	}()

	select {
	case <-done:
		// Good — publish never blocked.
	case <-time.After(2 * time.Second):
		t.Fatal("Publish blocked on slow subscriber")
	}
}

func TestBus_concurrentPublishSubscribe(t *testing.T) {
	bus := events.NewBus()
	var wg sync.WaitGroup
	const goroutines = 10

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ch, unsub := bus.Subscribe(8)
			defer unsub()
			bus.Publish(events.New(events.BlockMined, events.BlockMinedPayload{Chain: "l1"}))
			<-ch
		}()
	}

	wg.Wait()
}

func TestErrorOccurredPayload(t *testing.T) {
	ev := events.New(events.ErrorOccurred, events.ErrorPayload{Chain: "op-l2", Message: "boom"})
	if ev.Type != events.ErrorOccurred {
		t.Fatalf("type: want %q, got %q", events.ErrorOccurred, ev.Type)
	}
	var p events.ErrorPayload
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if p.Chain != "op-l2" || p.Message != "boom" {
		t.Fatalf("payload: got %+v", p)
	}
}
