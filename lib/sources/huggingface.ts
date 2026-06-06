import type { NormalizedPaper } from "@/lib/types";

interface HfAuthor {
  name?: string;
}
interface HfPaper {
  id?: string;
  title?: string;
  summary?: string;
  authors?: HfAuthor[];
  upvotes?: number;
  publishedAt?: string;
}
interface HfItem {
  paper?: HfPaper;
  title?: string;
  publishedAt?: string;
}

/** Parse the Hugging Face Daily Papers response. The paper `id` is an arXiv id. */
export function parseHfDaily(json: unknown): NormalizedPaper[] {
  if (!Array.isArray(json)) return [];
  return (json as HfItem[])
    .map((item): NormalizedPaper | null => {
      const p = item.paper ?? {};
      const arxivId = p.id ?? null;
      if (!arxivId) return null;
      const authors = (p.authors ?? [])
        .map((a) => a.name)
        .filter((n): n is string => Boolean(n));
      return {
        arxivId,
        doi: null,
        title: (item.title ?? p.title ?? "").trim(),
        authors,
        abstract: p.summary?.trim() || null,
        categories: [],
        htmlUrl: `https://arxiv.org/html/${arxivId}`,
        pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
        sourceUrl: `https://huggingface.co/papers/${arxivId}`,
        publishedAt: item.publishedAt ?? p.publishedAt ?? null,
        signals: { hfUpvotes: p.upvotes ?? 0 },
      };
    })
    .filter((p): p is NormalizedPaper => p !== null);
}

export async function fetchHfDaily(): Promise<NormalizedPaper[]> {
  const res = await fetch("https://huggingface.co/api/daily_papers", {
    headers: { "User-Agent": "PaperDeck/1.0 (research reader)" },
  });
  if (!res.ok) throw new Error(`huggingface ${res.status}`);
  return parseHfDaily(await res.json());
}
