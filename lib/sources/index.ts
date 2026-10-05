import { env } from "@/lib/env";
import { sourceContext, safeSourceError, SourceError } from "./http";
import type { NormalizedPaper, SourceId } from "@/lib/types";
import { fetchArxivLatest } from "./arxiv";
import { fetchHfDaily } from "./huggingface";
import { fetchPwcTrending } from "./paperswithcode";
import { fetchS2Famous } from "./semanticscholar";
import { fetchConferences } from "./conferences";
import { fetchScholar } from "./googlescholar";

export interface Source {
  id: SourceId;
  enabled: boolean;
  run: () => Promise<NormalizedPaper[]>;
}

export interface AggregateResult {
  results: NormalizedPaper[];
  errors: { id: string; error: string }[];
  outcomes: SourceOutcome[];
}

export interface SourceOutcome {
  id: string;
  status: "healthy" | "partial" | "failed";
  count: number;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  errors: string[];
}

/**
 * The source registry. Papers With Code is disabled by default — its public API
 * was retired in 2026 (now serves HTML). Google Scholar is enabled only when a
 * SerpAPI key is present (it bills per search).
 */
export function sources(): Source[] {
  const e = env();
  return [
    { id: "arxiv", enabled: true, run: () => fetchArxivLatest() },
    { id: "huggingface", enabled: true, run: () => fetchHfDaily() },
    { id: "paperswithcode", enabled: false, run: () => fetchPwcTrending() },
    { id: "semanticscholar", enabled: true, run: () => fetchS2Famous() },
    { id: "conferences", enabled: true, run: () => fetchConferences() },
    { id: "googlescholar", enabled: Boolean(e.SERPAPI_KEY), run: () => fetchScholar() },
  ];
}

/** Run a list of sources concurrently; a failing source is isolated, not fatal. */
export async function runSources(
  list: Pick<Source, "id" | "run">[],
  deadline = Date.now() + 35_000,
): Promise<AggregateResult> {
  const results: NormalizedPaper[] = [];
  const errors: { id: string; error: string }[] = [];
  const outcomes: SourceOutcome[] = [];
  await Promise.all(
    list.map(async (s) => {
      const started = Date.now();
      const warnings: string[] = [];
      const context = { deadline, warnings, successes: 0 };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const papers = await Promise.race([
          sourceContext.run(context, s.run),
          // Give aborted subrequests a brief chance to return earlier successes.
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SourceError("timeout")), Math.max(0, deadline - Date.now()) + 100); }),
        ]);
        results.push(...papers);
        outcomes.push({ id: s.id, status: warnings.length ? (context.successes || papers.length ? "partial" : "failed") : "healthy",
          count: papers.length, startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), latencyMs: Date.now() - started, errors: warnings });
        errors.push(...warnings.map(error => ({ id: s.id, error })));
      } catch (err) {
        const error = safeSourceError(err);
        errors.push({ id: s.id, error });
        outcomes.push({ id: s.id, status: "failed", count: 0, startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), latencyMs: Date.now() - started, errors: [error] });
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return { results, errors, outcomes };
}

/** Pull from every enabled source. */
export async function aggregate(): Promise<AggregateResult> {
  return runSources(sources().filter((s) => s.enabled));
}
