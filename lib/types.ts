export type SourceId =
  | "arxiv"
  | "huggingface"
  | "paperswithcode"
  | "semanticscholar"
  | "googlescholar"
  | "conferences";

/** Adapter metadata: null/empty means unknown, not a request to clear stored data.
 * Supplied non-empty values replace existing values on import; signals preserve
 * explicit zero. Imports cannot clear metadata; that requires a separate edit.
 */
export interface NormalizedPaper {
  arxivId: string | null;
  doi: string | null;
  title: string;
  authors: string[];
  abstract: string | null;
  categories: string[];
  htmlUrl: string | null;
  pdfUrl: string | null;
  sourceUrl: string | null;
  /** ISO 8601 string. */
  publishedAt: string | null;
  /** Short conference label, e.g. "NeurIPS 2024". Set only by the conferences source. */
  venue?: string | null;
  signals: PaperSignals;
}

export interface PaperSignals {
  /** Undefined means not supplied by this source; zero is an observed value. */
  hfUpvotes?: number;
  pwcStars?: number;
  citations?: number;
}

/** A row of the `papers` table as read back from Postgres. */
export interface PaperRow {
  id: string;
  arxiv_id: string | null;
  doi: string | null;
  title: string;
  authors: string[];
  abstract: string | null;
  categories: string[];
  html_url: string | null;
  pdf_url: string | null;
  source_url: string | null;
  published_at: string | null;
  venue?: string | null;
  hf_upvotes: number;
  pwc_stars: number;
  citations: number;
}

export type FeedTab = "latest" | "trending" | "famous";

export const FEED_TABS: FeedTab[] = ["latest", "trending", "famous"];

export type ReadingStatus = "to_read" | "reading" | "done";

export interface ProgressRow {
  scrollPct: number;
  blockAnchor: string | null;
  markedAnchor: string | null;
  /** Current viewport-bottom fraction (0–1) — written on scroll for the shelf "% read". */
  readPct: number;
  /** Button-marked read boundary (0–1 of content height); 0 = unmarked. */
  markedPct: number;
  readerKind: "html" | "pdf" | null;
  status: ReadingStatus;
}

export interface PdfAnchor {
  page: number;
  fingerprint: string;
  rects: { x: number; y: number; width: number; height: number }[];
}

/** A user's text highlight (+ optional note) within a paper's HTML reader. */
export interface Highlight {
  pdfAnchor?: PdfAnchor;
  id: string;
  paperId: string;
  blockAnchor: string;
  /** Char offset into the block's textContent (inclusive). */
  startOffset: number;
  /** Char offset into the block's textContent (exclusive). */
  endOffset: number;
  /** The selected text — used to display the note and to detect anchor drift. */
  quote: string;
  note: string | null;
}
