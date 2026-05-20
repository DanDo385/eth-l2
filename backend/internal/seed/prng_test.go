package seed

import (
	"testing"
)

func TestNew_deterministicFromSameSeed(t *testing.T) {
	a := New(42)
	b := New(42)
	for i := 0; i < 50; i++ {
		va, vb := a.Uint64(), b.Uint64()
		if va != vb {
			t.Fatalf("step %d: got %d vs %d", i, va, vb)
		}
	}
}

func TestNew_differentSeedsDifferentStreams(t *testing.T) {
	a := New(42)
	b := New(43)
	same := 0
	for i := 0; i < 20; i++ {
		if a.Uint64() == b.Uint64() {
			same++
		}
	}
	if same == 20 {
		t.Error("different seeds should produce different streams")
	}
}

func TestUint64_stateAdvances(t *testing.T) {
	p := New(1)
	v1 := p.Uint64()
	v2 := p.Uint64()
	if v1 == v2 {
		t.Error("successive calls should (almost certainly) differ")
	}
}

func TestIntn_inRange(t *testing.T) {
	p := New(7)
	for i := 0; i < 100; i++ {
		v := p.Intn(10)
		if v < 0 || v >= 10 {
			t.Fatalf("Intn(10) out of range: %d", v)
		}
	}
}

func TestIntn_panicsOnZero(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic for Intn(0)")
		}
	}()
	New(1).Intn(0)
}

func TestFork_independentFromParent(t *testing.T) {
	parent := New(42)
	child := parent.Fork("bot-a")
	// Advancing child should not affect parent stream
	for i := 0; i < 10; i++ {
		child.Uint64()
	}
	v1 := parent.Uint64()

	parent2 := New(42)
	parent2.Fork("bot-a") // fork but don't call Uint64 on child
	v2 := parent2.Uint64()

	if v1 != v2 {
		t.Error("child advancing should not affect parent stream")
	}
}

func TestFork_differentDomainsProduceDifferentChildren(t *testing.T) {
	p := New(42)
	a := p.Fork("alpha")
	b := p.Fork("beta")
	if a.Uint64() == b.Uint64() {
		// Extremely unlikely if the hash is working correctly
		t.Error("different fork domains should (almost certainly) produce different children")
	}
}

func TestFork_sameDomainReproducible(t *testing.T) {
	a := New(42).Fork("op-swap")
	b := New(42).Fork("op-swap")
	for i := 0; i < 20; i++ {
		if a.Uint64() != b.Uint64() {
			t.Errorf("fork %q: step %d diverged", "op-swap", i)
		}
	}
}

func TestKeccakDerive_doesNotAdvanceParent(t *testing.T) {
	p1 := New(99)
	p1.KeccakDerive("domain")
	v1 := p1.Uint64()

	p2 := New(99)
	v2 := p2.Uint64()

	if v1 != v2 {
		t.Error("KeccakDerive should not advance the parent state")
	}
}

// TestReproducibility is Task 18's core assertion:
// two PRNG trees rooted at the same seed must produce identical output sequences
// across all forked sub-streams, regardless of interleaving order.
func TestReproducibility_parallelForkStreams(t *testing.T) {
	streams := []string{"transfer", "op-swap", "zk-swap", "op-seq", "zk-seq"}

	// Build two independent PRNG trees from the same root seed.
	rootA := New(42)
	rootB := New(42)

	forksA := make([]*PRNG, len(streams))
	forksB := make([]*PRNG, len(streams))
	for i, domain := range streams {
		forksA[i] = rootA.Fork(domain)
		forksB[i] = rootB.Fork(domain)
	}

	// Simulate interleaved reads as they would happen during a session tick loop.
	for tick := 0; tick < 100; tick++ {
		for i := range streams {
			va := forksA[i].Uint64()
			vb := forksB[i].Uint64()
			if va != vb {
				t.Fatalf("tick %d stream %q: got %d vs %d", tick, streams[i], va, vb)
			}
		}
	}
}
