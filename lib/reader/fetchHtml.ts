import { sanitizePaperHtml } from "@/lib/reader/sanitize";

export type ReaderHtmlResult = { kind: "html"; html: string } | { kind: "none" };

const UA = "PaperDeck/1.0 (research reader)";
const CACHE_REFRESH_TIMEOUT_MS = 8000;

/**
 * Try to load a paper's HTML for in-app rendering: arXiv native HTML first,
 * then ar5iv as a fallback (covers more of arXiv's history). Returns sanitized
 * HTML or `{ kind: "none" }` when neither has a usable HTML version.
 */
export async function loadReaderHtml(arxivId: string, cachedHtml?: string): Promise<ReaderHtmlResult> {
  const candidates = [`https://arxiv.org/html/${arxivId}`, `https://ar5iv.org/abs/${arxivId}`];
  const signal = cachedHtml === undefined ? undefined : AbortSignal.timeout(CACHE_REFRESH_TIMEOUT_MS);
  let sourceChanged = false;

  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal });
      if (!res.ok) continue;
      const raw = await res.text();
      // arXiv serves a small stub page when no HTML exists; require real content.
      if (raw.length > 2000) {
        const baseUrl = res.url || url;
        // Saved highlights and progress refer to block indices and text offsets in the cached HTML.
        if (cachedHtml !== undefined && sanitizePaperHtml(raw, baseUrl, { renderSvgObjects: false }) !== cachedHtml) {
          sourceChanged = true;
          continue;
        }
        return { kind: "html", html: sanitizePaperHtml(raw, baseUrl) };
      }
    } catch {
      // network error — try the next candidate
    }
  }
  if (sourceChanged && cachedHtml !== undefined) return { kind: "html", html: cachedHtml };
  return { kind: "none" };
}
