import { env } from "@/lib/env";
import type { NormalizedPaper } from "@/lib/types";
import { parseS2 } from "./semanticscholar";

interface ConferenceVenue {
  /** Short badge label. */
  label: string;
  /** Semantic Scholar canonical venue name used for the `venue` filter. */
  s2Venue: string;
}

const VENUES: ConferenceVenue[] = [
  { label: "NeurIPS", s2Venue: "Neural Information Processing Systems" },
  { label: "ICML", s2Venue: "International Conference on Machine Learning" },
  { label: "ICLR", s2Venue: "International Conference on Learning Representations" },
];

const FIELDS = "title,abstract,year,citationCount,authors,externalIds,openAccessPdf";
const MAX_PER_VENUE = 100;

/** Stamp a short venue label ("NeurIPS 2024") onto parsed papers. Pure + testable. */
export function labelConference(papers: NormalizedPaper[], label: string): NormalizedPaper[] {
  return papers.map((p) => {
    const year = p.publishedAt ? p.publishedAt.slice(0, 4) : null;
    return { ...p, venue: year ? `${label} ${year}` : label };
  });
}

/**
 * A three-year window ending at the current year, e.g. "2024-2026". Wide enough
 * to tolerate indexing lag (the current year's proceedings are often still sparse
 * or unindexed), narrow enough to keep the pull bounded and recent.
 */
function recentYears(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  return `${y - 2}-${y}`;
}

/**
 * Pull the most-cited recent papers from top ML conferences (NeurIPS / ICML /
 * ICLR) via Semantic Scholar's *bulk* search, filtered by venue + year and sorted
 * by citations. The relevance `/paper/search` endpoint needs a text `query` that
 * biases results toward papers merely mentioning the venue; bulk filters purely on
 * venue, returning the whole (sorted) proceedings — we keep the top MAX_PER_VENUE.
 * No API key required (rate-limited; a 429 skips that venue). Each paper is stamped
 * with a short venue badge label. Most also exist as arXiv preprints, so dedup
 * merges the badge onto rows already in the corpus.
 */
export async function fetchConferences(years: string = recentYears()): Promise<NormalizedPaper[]> {
  const key = env().SEMANTIC_SCHOLAR_API_KEY;
  const headers: Record<string, string> = { "User-Agent": "PaperDeck/1.0 (research reader)" };
  if (key) headers["x-api-key"] = key;

  const all: NormalizedPaper[] = [];
  for (const v of VENUES) {
    const url =
      `https://api.semanticscholar.org/graph/v1/paper/search/bulk?venue=${encodeURIComponent(v.s2Venue)}` +
      `&year=${years}&sort=${encodeURIComponent("citationCount:desc")}&fields=${FIELDS}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 429) continue; // expected without a key — skip this venue
      throw new Error(`conferences ${res.status}`);
    }
    // Bulk returns the full venue sorted by citations; keep the most-cited slice.
    const top = parseS2(await res.json()).slice(0, MAX_PER_VENUE);
    all.push(...labelConference(top, v.label));
  }
  return all;
}
