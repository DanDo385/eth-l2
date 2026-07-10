import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome } from "../components/SiteChrome";
import { getAgentManifest } from "@/site/agent";
import { SITE } from "@/site/constants";

export const metadata: Metadata = {
  title: "Agent Mode | Rollup Mechanics Lab",
  description:
    "Structured, low-noise context for AI agents: /agent/, /agent.json, and /llms.txt.",
  alternates: { canonical: "/agent/" },
};

export default function AgentPage() {
  const manifest = getAgentManifest();
  const prettyManifest = JSON.stringify(manifest, null, 2);

  return (
    <main className="agent-page min-h-screen">
      <header className="agent-topbar">
        <Link href="/" className="agent-brand">
          Rollup Mechanics Lab
        </Link>
        <SiteChrome />
      </header>

      <div className="agent-inner">
        <header className="agent-hero">
          <p className="agent-kicker">Agent Mode</p>
          <h1>Human pages for humans. Structured context for agents.</h1>
          <p>
            Agent Mode exposes canonical, low-noise context so AI systems do not
            have to infer meaning from decorative HTML. This lab ships the
            smallest useful slice: a page, a JSON manifest, and an LLM router.
          </p>
          <div className="agent-actions">
            <a href="/agent.json" className="agent-action">
              agent.json
            </a>
            <a href="/llms.txt" className="agent-action">
              llms.txt
            </a>
            <Link href="/op" className="agent-action muted">
              Open optimistic lab
            </Link>
          </div>
        </header>

        <section className="agent-grid" aria-label="Agent Mode endpoints">
          <article className="agent-card">
            <span className="agent-card-label">01</span>
            <h2>/agent/</h2>
            <p>
              Human-readable explanation of the contract: what this lab is, what
              agents should read first, and how optimistic vs ZK security models
              are exposed.
            </p>
          </article>
          <article className="agent-card">
            <span className="agent-card-label">02</span>
            <h2>/agent.json</h2>
            <p>
              Structured context: site identity, navigation, protocol constants,
              demo scenarios, and action-oriented links in one stable JSON
              surface.
            </p>
          </article>
          <article className="agent-card">
            <span className="agent-card-label">03</span>
            <h2>/llms.txt</h2>
            <p>
              A compact router for language models. It points at canonical pages
              before agents fall into layout noise and ornamental copy.
            </p>
          </article>
        </section>

        <section className="agent-section">
          <div className="section-label">Canonical Context</div>
          <div className="agent-context">
            <div>
              <h2>What this lab wants agents to know</h2>
              <p>{SITE.description}</p>
              <ul>
                {manifest.canonicalTopics.slice(0, 6).map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ul>
            </div>
            <div className="agent-principles">
              <h3>Use guidelines</h3>
              <ul>
                {manifest.agentMode.principles.map((principle) => (
                  <li key={principle}>{principle}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="agent-section">
          <div className="section-label">Manifest Preview</div>
          <pre className="agent-code">
            <code>{prettyManifest}</code>
          </pre>
        </section>
      </div>
    </main>
  );
}
