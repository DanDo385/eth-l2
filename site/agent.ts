import { OP_DEMOS, ZK_DEMOS } from "@/app/data/demoGallery";
import {
  CHALLENGE_WINDOW_SECONDS,
  OPTIMISTIC_SUSPICION_PROBABILITY,
  PORTAL_BOND_ETH,
  ZK_SUSPICION_PROBABILITY,
} from "@/app/data/protocol";
import { PUBLIC_TUNNEL_ORIGIN } from "@/app/data/ports";
import { SITE } from "./constants";

const PRINCIPLES = [
  "Canonical lab context lives on this site’s Agent Mode surfaces - prefer /agent.json over scraping decorative UI HTML.",
  "Agent-facing context should be structured, stable, citation-aware, and low-noise.",
  "This is a teaching rollup lab (FraudProofGame / ZkValidityVerifier stand-ins), not a production prover stack.",
  "Do not invent LAN IPs, private staging hosts, or secrets; use documented public endpoints only.",
];

function siteUrl(path = "/"): string {
  const base = SITE.url.replace(/\/$/, "");
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

type DemoScenario = {
  id: string;
  lane: "optimistic" | "zk";
  seed: number;
  name: string;
  summary: string;
  detail: string;
  recommended: boolean;
  urls: { lab: string; deepLink: string };
};

export function getAgentManifest() {
  const demos: DemoScenario[] = [
    ...OP_DEMOS.map((demo) => ({
      id: `op-${demo.seed}`,
      lane: "optimistic" as const,
      seed: demo.seed,
      name: demo.title,
      summary: demo.caption,
      detail: demo.detail,
      recommended: Boolean(demo.recommended),
      urls: {
        lab: siteUrl("/op"),
        deepLink: `${siteUrl("/op")}#seed=${demo.seed}`,
      },
    })),
    ...ZK_DEMOS.map((demo) => ({
      id: `zk-${demo.seed}`,
      lane: "zk" as const,
      seed: demo.seed,
      name: demo.title,
      summary: demo.caption,
      detail: demo.detail,
      recommended: Boolean(demo.recommended),
      urls: {
        lab: siteUrl("/zk"),
        deepLink: `${siteUrl("/zk")}#seed=${demo.seed}`,
      },
    })),
  ];

  return {
    schema: siteUrl("/agent.json"),
    schemaVersion: "0.1",
    site: {
      name: SITE.name,
      url: SITE.url,
      description: SITE.description,
      owner: SITE.owner,
    },
    agentMode: {
      purpose:
        "Expose canonical, structured context for AI agents so they do not have to infer meaning from decorative HTML.",
      endpoints: {
        overview: siteUrl("/agent/"),
        manifest: siteUrl("/agent.json"),
        router: siteUrl("/llms.txt"),
      },
      preferredEntryPoints: [
        siteUrl("/agent/"),
        siteUrl("/agent.json"),
        siteUrl("/llms.txt"),
        siteUrl("/"),
        siteUrl("/op"),
        siteUrl("/zk"),
        `${SITE.github}/blob/main/README.md`,
        `${SITE.github}/blob/main/DEMO_GUIDE.md`,
        `${SITE.github}/blob/main/AGENTS.md`,
      ],
      principles: PRINCIPLES,
    },
    navigation: [
      { id: "home", label: "Home", href: siteUrl("/") },
      { id: "optimistic", label: "Optimistic", href: siteUrl("/op") },
      { id: "zk", label: "ZK", href: siteUrl("/zk") },
      { id: "agent", label: "Agent Mode", href: siteUrl("/agent/") },
    ],
    about: {
      portfolioLane: "deep-weeds",
      emotionalHook: "Catch the lying sequencer.",
      technicalHook:
        "Bad batch → watcher flags (off-chain) → user verifies → challenge bond → FraudProofGame → opcode/storage mismatch + source line → bond settlement.",
      labs: [
        {
          id: "optimistic",
          path: "/op",
          alias: "/optimistic",
          summary:
            "Output roots, local verification, user challenges, Merkle bisection fraud proofs, and bond settlement.",
        },
        {
          id: "zk",
          path: "/zk",
          summary:
            "Witnesses, proof generation stand-in, L1 verifier checks, and validity settlement without a challenge window.",
        },
      ],
      protocol: {
        sequencerBondEth: PORTAL_BOND_ETH,
        challengerBondEth: PORTAL_BOND_ETH,
        challengeWindowSeconds: CHALLENGE_WINDOW_SECONDS,
        optimisticSuspicionProbability: OPTIMISTIC_SUSPICION_PROBABILITY,
        zkInvalidClaimProbability: ZK_SUSPICION_PROBABILITY,
      },
      summary: SITE.description,
    },
    contact: {
      email: SITE.owner.email,
      github: SITE.github,
      portfolio: SITE.portfolio,
    },
    canonicalTopics: [
      "optimistic rollups",
      "ZK rollups",
      "fraud proofs",
      "Merkle bisection",
      "challenge bonds",
      "sequencer honesty",
      "validity proofs",
      "L2 → L1 settlement",
      "agent-readable lab surfaces",
    ],
    projects: [
      {
        title: SITE.name,
        slug: "eth-l2",
        status: "live",
        featured: true,
        summary: SITE.description,
        tags: ["rollup", "optimistic", "zk", "fraud-proof", "education"],
        tech: ["Next.js", "Go", "Solidity", "Foundry", "Anvil"],
        urls: {
          canonical: siteUrl("/"),
          github: SITE.github,
          demo: siteUrl("/"),
          media: {
            previewGif: siteUrl("/gif/preview.gif"),
          },
        },
      },
    ],
    writing: [] as Array<{
      title: string;
      slug: string;
      date: string;
      category: string;
      excerpt: string;
      urls: { canonical: string; relatedProject: string | null };
    }>,
    demos: [
      {
        slug: "optimistic-lab",
        name: "Optimistic Rollup Lab",
        lane: "optimistic",
        project: siteUrl("/"),
        lab: siteUrl("/op"),
        healthProbe: siteUrl("/health/ready"),
        stagingApi: PUBLIC_TUNNEL_ORIGIN,
        runtime: "Go + Anvil on Ubuntu via Cloudflare Tunnel when hosted",
        status: "interactive",
        scenarios: demos.filter((d) => d.lane === "optimistic"),
      },
      {
        slug: "zk-lab",
        name: "ZK Rollup Lab",
        lane: "zk",
        project: siteUrl("/"),
        lab: siteUrl("/zk"),
        healthProbe: siteUrl("/health/ready"),
        stagingApi: PUBLIC_TUNNEL_ORIGIN,
        runtime: "Go + Anvil on Ubuntu via Cloudflare Tunnel when hosted",
        status: "interactive",
        scenarios: demos.filter((d) => d.lane === "zk"),
      },
    ],
  };
}

function llmsLink(label: string, href: string, note?: string): string {
  return note ? `- [${label}](${href}): ${note}` : `- [${label}](${href})`;
}

export function getLlmsTxt(): string {
  const manifest = getAgentManifest();

  const agentLines = [
    llmsLink(
      "Agent overview",
      manifest.agentMode.endpoints.overview,
      "Human-readable contract and endpoint map",
    ),
    llmsLink(
      "JSON manifest",
      manifest.agentMode.endpoints.manifest,
      "Structured labs, demos, topics, and links",
    ),
    llmsLink(
      "LLM router",
      manifest.agentMode.endpoints.router,
      "This file; compact markdown router for language models",
    ),
  ].join("\n");

  const siteLines = [
    llmsLink("Home", siteUrl("/"), "Lab chooser - optimistic vs ZK"),
    llmsLink("Optimistic lab", siteUrl("/op"), "Fraud proofs, bonds, challenge window"),
    llmsLink("ZK lab", siteUrl("/zk"), "Validity proofs and verifier settlement"),
    llmsLink("README", `${SITE.github}/blob/main/README.md`, "Setup, architecture, protocol constants"),
    llmsLink("Demo guide", `${SITE.github}/blob/main/DEMO_GUIDE.md`, "Suggested live demo flow"),
  ].join("\n");

  const demoLines = manifest.demos
    .map((demo) =>
      llmsLink(
        demo.name,
        demo.lab,
        `Interactive lab. Health probe: ${demo.healthProbe}. Public API origin when hosted: ${demo.stagingApi}.`,
      ),
    )
    .join("\n");

  const scenarioLines = manifest.demos
    .flatMap((demo) => demo.scenarios)
    .map((scenario) =>
      llmsLink(
        `${scenario.lane === "optimistic" ? "OP" : "ZK"} · ${scenario.name} (seed ${scenario.seed})`,
        scenario.urls.deepLink,
        scenario.summary,
      ),
    )
    .join("\n");

  const projectLines = manifest.projects
    .map((project) =>
      llmsLink(project.title, project.urls.demo ?? project.urls.canonical, project.summary),
    )
    .join("\n");

  const contactLines = [
    `- Email: ${manifest.contact.email}`,
    `- GitHub: ${manifest.contact.github}`,
    `- Portfolio: ${manifest.contact.portfolio}`,
    `- Website: ${SITE.url}`,
  ].join("\n");

  return [
    `# ${SITE.name}`,
    `> ${SITE.description}`,
    "",
    manifest.about.summary,
    "",
    "## Agent Mode",
    "",
    agentLines,
    "",
    "## Site",
    "",
    siteLines,
    "",
    "## Projects",
    "",
    projectLines,
    "",
    "## Interactive Labs",
    "",
    demoLines,
    "",
    "## Demo scenarios",
    "",
    scenarioLines,
    "",
    "## Writing",
    "",
    "- No published writing on this site yet.",
    "",
    "## Contact",
    "",
    contactLines,
    "",
  ].join("\n");
}
