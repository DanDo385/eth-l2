"use client";

import type { SourceLoc } from "../types";
import {
  engineCompareBundle,
  type EngineSourceExhibit,
  type SourceLine,
} from "../data/engineSourceExhibits";

function shortFile(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function lineClass(line: SourceLine, tone: "honest" | "lying"): string {
  if (line.highlight) {
    return tone === "honest"
      ? "bg-emerald-500/15 text-emerald-100 border-l-2 border-emerald-400"
      : "bg-red-500/15 text-red-100 border-l-2 border-red-400";
  }
  if (line.dim) return "text-zinc-500 border-l-2 border-transparent";
  return "text-zinc-300 border-l-2 border-transparent";
}

function CodeBlock({
  exhibit,
  resolved,
}: {
  exhibit: EngineSourceExhibit;
  resolved?: SourceLoc;
}) {
  const tone = exhibit.role;
  const headerTone =
    tone === "honest" ? "text-emerald-400/90" : "text-red-400/90";
  const borderTone =
    tone === "honest" ? "border-emerald-900/50" : "border-red-800/60";
  const bgTone = tone === "honest" ? "bg-emerald-950/15" : "bg-red-950/20";

  return (
    <div className={`overflow-hidden rounded-lg border ${borderTone} ${bgTone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-zinc-800/80 px-2.5 py-1.5">
        <p className={`font-mono text-xs ${headerTone}`}>
          {shortFile(exhibit.file)}
          {resolved ? `:${resolved.line}` : ""} -{" "}
          {tone === "honest" ? "honest engine" : "this batch's engine"}
        </p>
        <p className="text-xs text-zinc-600">{exhibit.caption}</p>
      </div>
      <pre className="overflow-x-auto p-2 font-mono text-xs leading-relaxed">
        {exhibit.lines.map((line) => (
          <div
            key={`${exhibit.file}-${line.n}`}
            className={`flex gap-2 px-1.5 py-0.5 ${lineClass(line, tone)}`}
          >
            <span className="w-6 shrink-0 select-none text-right text-xs text-zinc-600">
              {line.n}
            </span>
            <span className="min-w-0 whitespace-pre-wrap break-all">{line.text}</span>
          </div>
        ))}
      </pre>
      {resolved?.lineText && (
        <p className="border-t border-zinc-800/80 px-2.5 py-1.5 text-xs leading-snug text-zinc-600">
          Source map hit:{" "}
          <span className="font-mono text-zinc-400">{resolved.lineText.trim()}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Side-by-side (or stacked) Solidity exhibits for the fraud verdict.
 * Prefer the curated multi-line engine snippets; fall back to single source-map lines.
 */
export function EngineSourceCompare({
  engineType,
  honestSource,
  lyingSource,
  onchainDivergenceStep,
  compact = false,
}: {
  engineType?: string | null;
  honestSource?: SourceLoc;
  lyingSource?: SourceLoc;
  onchainDivergenceStep?: number;
  compact?: boolean;
}) {
  const bundle = engineCompareBundle(engineType);

  if (!bundle && !honestSource && !lyingSource) return null;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          {bundle?.title ?? "The offending Solidity"}
          {typeof onchainDivergenceStep === "number" && (
            <span className="text-zinc-600">
              {" "}
              · on-chain fraud proof isolated VM step #{onchainDivergenceStep}
            </span>
          )}
        </p>
        {bundle && (
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            {bundle.summary}
          </p>
        )}
        {!bundle && (
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Resolved from the deployed bytecode source map - honest engine vs the
            engine this batch actually ran.
          </p>
        )}
      </div>

      {bundle ? (
        <div
          className={
            compact
              ? "grid gap-2"
              : "grid gap-2 sm:grid-cols-2 sm:gap-3"
          }
        >
          <CodeBlock exhibit={bundle.honest} resolved={honestSource} />
          <CodeBlock exhibit={bundle.lying} resolved={lyingSource} />
        </div>
      ) : (
        <div className={compact ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}>
          {honestSource && (
            <FallbackLine source={honestSource} tone="honest" label="honest engine" />
          )}
          {lyingSource && (
            <FallbackLine
              source={lyingSource}
              tone="lying"
              label="this batch's engine"
            />
          )}
        </div>
      )}
    </div>
  );
}

function FallbackLine({
  source,
  tone,
  label,
}: {
  source: SourceLoc;
  tone: "honest" | "lying";
  label: string;
}) {
  const classes =
    tone === "honest"
      ? "border-emerald-900/50 bg-emerald-950/10 text-emerald-200"
      : "border-red-800/60 bg-red-950/20 text-red-200";
  const labelClass = tone === "honest" ? "text-emerald-400/90" : "text-red-400/90";

  return (
    <div className={`rounded-lg border p-2.5 ${classes}`}>
      <p className={`mb-1 font-mono text-xs ${labelClass}`}>
        {shortFile(source.file)}:{source.line} - {label}
      </p>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
        {source.lineText}
      </pre>
    </div>
  );
}
