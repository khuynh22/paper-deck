import { env } from "@/lib/env";
import type { NormalizedPaper } from "@/lib/types";

interface S2Author {
  name?: string;
}
interface S2Paper {
  title?: string;
  abstract?: string | null;
  year?: number | null;
  citationCount?: number;
  authors?: S2Author[];
  externalIds?: { ArXiv?: string; DOI?: string } | null;
  openAccessPdf?: { url?: string } | null;
}
interface S2Response {
  data?: S2Paper[];
}

/** Parse a Semantic Scholar Graph API search response. */
export function parseS2(json: unknown): NormalizedPaper[] {
  const data = (json as S2Response)?.data;
  if (!Array.isArray(data)) return [];
  return data.map((p) => {
    const arxivId = p.externalIds?.ArXiv ?? null;
    const doi = p.externalIds?.DOI ?? null;
    return {
      arxivId,
      doi,
      title: (p.title ?? "").trim(),
      authors: (p.authors ?? []).map((a) => a.name).filter((n): n is string => Boolean(n)),
      abstract: p.abstract?.trim() || null,
      categories: [],
      htmlUrl: arxivId ? `https://arxiv.org/html/${arxivId}` : null,
      pdfUrl: p.openAccessPdf?.url ?? (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null),
      sourceUrl: arxivId
        ? `https://arxiv.org/abs/${arxivId}`
        : doi
          ? `https://doi.org/${doi}`
          : null,
      publishedAt: p.year ? `${p.year}-01-01T00:00:00Z` : null,
      signals: { citations: p.citationCount ?? 0 },
    } satisfies NormalizedPaper;
  });
}

const DEFAULT_QUERIES = [
  "large language models",
  "transformer",
  "diffusion models",
  "reinforcement learning",
];

const FIELDS = "title,abstract,year,citationCount,authors,externalIds,openAccessPdf";

/** Fetch highly-cited papers for a few seed ML topics. Needs an API key for real volume. */
export async function fetchS2Famous(
  queries: string[] = DEFAULT_QUERIES,
  perQuery = 20,
): Promise<NormalizedPaper[]> {
  const key = env().SEMANTIC_SCHOLAR_API_KEY;
  const headers: Record<string, string> = { "User-Agent": "PaperDeck/1.0 (research reader)" };
  if (key) headers["x-api-key"] = key;

  const all: NormalizedPaper[] = [];
  for (const q of queries) {
    const url =
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}` +
      `&limit=${perQuery}&fields=${FIELDS}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      // 429 without a key is expected — skip this query rather than fail the whole source.
      if (res.status === 429) continue;
      throw new Error(`semanticscholar ${res.status}`);
    }
    all.push(...parseS2(await res.json()));
  }
  return all;
}
