/** Public site identity for Agent Mode and metadata. No LAN / secrets. */
export const SITE = {
  name: "Rollup Mechanics Lab",
  description:
    "Interactive optimistic and ZK rollup mechanics: L2 batches, lying sequencers, Merkle bisection fraud proofs, bond economics, and validity proofs — visualized step by step.",
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://eth-l2.vercel.app",
  github: "https://github.com/DanDo385/eth-l2",
  portfolio: "https://magro.dev",
  owner: {
    name: "Daniel Magro",
    email: "dan@magro.dev",
    role: "Builder — rollup mechanics lab (deep-weeds portfolio lane)",
  },
};
