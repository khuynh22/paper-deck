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
const MAX_PER_VENUE = 50;

/** Stamp a short venue label ("NeurIPS 2024") onto parsed papers. Pure + testable. */
export function labelConference(papers: NormalizedPaper[], label: string): NormalizedPaper[] {
  return papers.map((p) => {
    const year = p.publishedAt ? p.publishedAt.slice(0, 4) : null;
    return { ...p, venue: year ? `${label} ${year}` : label };
  });
}

/** The last two calendar years, e.g. "2025-2026" — bounds conference volume. */
function recentYears(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  return `${y - 1}-${y}`;
}

/**
 * Pull recent papers from top ML conferences (NeurIPS / ICML / ICLR) via Semantic
 * Scholar's venue filter. No API key required (rate-limited; a 429 skips that venue).
 * Each paper is stamped with a short venue badge label.
 */
export async function fetchConferences(years: string = recentYears()): Promise<NormalizedPaper[]> {
  const key = env().SEMANTIC_SCHOLAR_API_KEY;
  const headers: Record<string, string> = { "User-Agent": "PaperDeck/1.0 (research reader)" };
  if (key) headers["x-api-key"] = key;

  const all: NormalizedPaper[] = [];
  for (const v of VENUES) {
    const url =
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(v.label)}` +
      `&venue=${encodeURIComponent(v.s2Venue)}&year=${years}&limit=${MAX_PER_VENUE}&fields=${FIELDS}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 429) continue; // expected without a key — skip this venue
      throw new Error(`conferences ${res.status}`);
    }
    all.push(...labelConference(parseS2(await res.json()), v.label));
  }
  return all;
}
