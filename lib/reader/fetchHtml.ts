import { sanitizePaperHtml } from "@/lib/reader/sanitize";

export type ReaderHtmlResult = { kind: "html"; html: string } | { kind: "none" };

const UA = "PaperDeck/1.0 (research reader)";

/**
 * Try to load a paper's HTML for in-app rendering: arXiv native HTML first,
 * then ar5iv as a fallback (covers more of arXiv's history). Returns sanitized
 * HTML or `{ kind: "none" }` when neither has a usable HTML version.
 */
export async function loadReaderHtml(arxivId: string): Promise<ReaderHtmlResult> {
  const candidates = [`https://arxiv.org/html/${arxivId}`, `https://ar5iv.org/abs/${arxivId}`];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
      if (!res.ok) continue;
      const raw = await res.text();
      // arXiv serves a small stub page when no HTML exists; require real content.
      if (raw.length > 2000) {
        // res.url is the final URL after redirects (arXiv redirects the unversioned
        // /html/<id> to the versioned page); relative <img src>s resolve against it.
        return { kind: "html", html: sanitizePaperHtml(raw, res.url || url) };
      }
    } catch {
      // network error — try the next candidate
    }
  }
  return { kind: "none" };
}
