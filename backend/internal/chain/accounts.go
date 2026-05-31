package chain

// AccountRole describes one Anvil demo account (index matches PrivKey / AnvilAddress).
type AccountRole struct {
	Index int
	Role  string
	Addr  string
}

// DemoAccounts is the canonical role → address map for backend and frontend.
// Indices 0–2: protocol actors. 3–4: L2 traders (swap bots).
var DemoAccounts = []AccountRole{
	{Index: 0, Role: "Deployer", Addr: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"},
	{Index: 1, Role: "Sequencer", Addr: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"},
	{Index: 2, Role: "Challenger", Addr: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"},
	{Index: 3, Role: "Trader 0", Addr: "0x90F79bf6EB2c4f870365E785982E1f101E93b906"},
	{Index: 4, Role: "Trader 1", Addr: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"},
}

const demoAccountCount = 5
