export type SourceId =
  | "arxiv"
  | "huggingface"
  | "paperswithcode"
  | "semanticscholar"
  | "googlescholar";

/** The common shape every source adapter normalizes its results into. */
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
  signals: PaperSignals;
}

export interface PaperSignals {
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
  readerKind: "html" | "pdf" | null;
  status: ReadingStatus;
}
