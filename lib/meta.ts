import type { Metadata } from "next";
import type { PaperRow } from "@/lib/types";
import { authorLine } from "@/lib/format";

/**
 * Clip `text` to at most `max` characters on a word boundary, appending "…" when
 * trimmed. Returns "" for null/blank so callers can fall back.
 */
export function clampText(text: string | null | undefined, max = 200): string {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

/**
 * Shape a paper into page `Metadata` (title, description, canonical, OG + Twitter).
 * The `og:image` / `twitter:image` tags are injected by the `opengraph-image` file
 * convention, so they are intentionally not set here. Pure + server-free → testable.
 */
export function paperMetadata(paper: PaperRow, url: string): Metadata {
  const description = clampText(paper.abstract) || authorLine(paper.authors);
  return {
    title: paper.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: paper.title,
      description,
      publishedTime: paper.published_at ?? undefined,
    },
    twitter: { card: "summary_large_image", title: paper.title, description },
  };
}
