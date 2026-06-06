import { env } from "@/lib/env";
import type { NormalizedPaper, SourceId } from "@/lib/types";
import { fetchArxivLatest } from "./arxiv";
import { fetchHfDaily } from "./huggingface";
import { fetchPwcTrending } from "./paperswithcode";
import { fetchS2Famous } from "./semanticscholar";
import { fetchScholar } from "./googlescholar";

export interface Source {
  id: SourceId;
  enabled: boolean;
  run: () => Promise<NormalizedPaper[]>;
}

export interface AggregateResult {
  results: NormalizedPaper[];
  errors: { id: string; error: string }[];
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
    { id: "googlescholar", enabled: Boolean(e.SERPAPI_KEY), run: () => fetchScholar() },
  ];
}

/** Run a list of sources concurrently; a failing source is isolated, not fatal. */
export async function runSources(
  list: Pick<Source, "id" | "run">[],
): Promise<AggregateResult> {
  const results: NormalizedPaper[] = [];
  const errors: { id: string; error: string }[] = [];
  await Promise.all(
    list.map(async (s) => {
      try {
        results.push(...(await s.run()));
      } catch (err) {
        errors.push({ id: s.id, error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );
  return { results, errors };
}

/** Pull from every enabled source. */
export async function aggregate(): Promise<AggregateResult> {
  return runSources(sources().filter((s) => s.enabled));
}
