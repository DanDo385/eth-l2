package seed

import (
	"encoding/binary"

	"github.com/ethereum/go-ethereum/crypto"
)

// PRNG is a deterministic pseudo-random number generator based on keccak256.
// It is not safe for concurrent use.
type PRNG struct {
	state [32]byte
	count uint64
}

// New initialises a PRNG from a uint64 seed.
func New(seedVal uint64) *PRNG {
	var b [8]byte
	binary.BigEndian.PutUint64(b[:], seedVal)
	p := &PRNG{}
	copy(p.state[:], crypto.Keccak256(b[:]))
	return p
}

// Uint64 advances the state and returns the next deterministic 64-bit value.
func (p *PRNG) Uint64() uint64 {
	p.count++
	var buf [40]byte
	copy(buf[:32], p.state[:])
	binary.BigEndian.PutUint64(buf[32:], p.count)
	copy(p.state[:], crypto.Keccak256(buf[:]))
	return binary.BigEndian.Uint64(p.state[:8])
}

// Intn returns a value in [0, n).
func (p *PRNG) Intn(n int) int {
	if n <= 0 {
		panic("seed.PRNG.Intn: n must be positive")
	}
	return int(p.Uint64() % uint64(n))
}

// KeccakDerive returns a 32-byte value for the given domain without advancing the main stream.
// Used for fraud-injection decisions: keccak(state || domain) so each domain gets an independent value.
func (p *PRNG) KeccakDerive(domain string) [32]byte {
	combined := append(p.state[:], []byte(domain)...)
	var out [32]byte
	copy(out[:], crypto.Keccak256(combined))
	return out
}

// Fork returns a new independent PRNG seeded from keccak(state || domain).
// Each bot/component should use its own fork so their random streams are independent
// of call ordering, making the demo reproducible across runs.
func (p *PRNG) Fork(domain string) *PRNG {
	derived := p.KeccakDerive(domain)
	child := &PRNG{}
	copy(child.state[:], derived[:])
	return child
}
