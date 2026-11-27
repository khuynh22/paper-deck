import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/db/server";
import { serviceClient } from "@/lib/db/service";
import { resolvePaperId } from "@/lib/db/paperIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Uncached papers are fetched + sanitized live; a few large ar5iv-fallback docs
// (no native arXiv HTML) can take several seconds. Lift the default ~10s cap.
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const HTML_CACHE_PREFIX = "<!--paperdeck:reader-html:2-->";

async function proxyPdf(pdfUrl: string): Promise<Response> {
  const upstream = await fetch(pdfUrl, {
    headers: { "User-Agent": "PaperDeck/1.0 (research reader)" },
    redirect: "follow",
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "pdf unavailable" }, { status: 502 });
  }
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = await serverClient();
  const canonicalId = await resolvePaperId(db, id);
  if (canonicalId !== id) {
    const url = req.nextUrl.clone();
    url.pathname = `/api/reader/${canonicalId}`;
    return NextResponse.redirect(url);
  }

  const { data: paper, error } = await db
    .from("papers")
    .select("id, title, arxiv_id, pdf_url, source_url")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!paper) return NextResponse.json({ error: "not found" }, { status: 404 });

  // --- PDF byte proxy ---
  if (req.nextUrl.searchParams.get("pdf") === "1") {
    if (!paper.pdf_url) return NextResponse.json({ error: "no pdf" }, { status: 404 });
    return proxyPdf(paper.pdf_url);
  }

  const title = paper.title as string;
  const htmlResponse = (html: string) => NextResponse.json({ kind: "html", html, pdfUrl: paper.pdf_url, title });

  // --- Cached sanitized HTML ---
  const { data: cached } = await db
    .from("paper_content")
    .select("kind, sanitized_html, fetched_at")
    .eq("paper_id", id)
    .maybeSingle();

  const cachedHtml: string | undefined = cached?.kind === "html" && cached.sanitized_html
    ? cached.sanitized_html
    : undefined;
  if (cachedHtml?.startsWith(HTML_CACHE_PREFIX)) {
    return htmlResponse(cachedHtml.slice(HTML_CACHE_PREFIX.length));
  }

  // --- Fetch + sanitize HTML on demand, then cache ---
  if (paper.arxiv_id) {
    try {
      const { loadReaderHtml } = await import("@/lib/reader/fetchHtml");
      const result = await loadReaderHtml(paper.arxiv_id, cachedHtml);
      if (result.kind === "html") {
        try {
          const content = serviceClient().from("paper_content");
          const payload = { kind: "html", sanitized_html: HTML_CACHE_PREFIX + result.html };
          const { error: cacheError } = await (cached
            ? content.update({ ...payload, fetched_at: new Date().toISOString() })
              .eq("paper_id", id).eq("fetched_at", cached.fetched_at)
            : content.upsert({ ...payload, paper_id: id }, { onConflict: "paper_id", ignoreDuplicates: true }));
          if (cacheError) console.error("reader: html cache write failed", cacheError);
        } catch (cacheError) {
          console.error("reader: html cache write failed", cacheError);
        }
        return htmlResponse(result.html);
      }
      // result.kind === "none" — no HTML version; fall through to PDF/none below.
    } catch (e) {
      // Unexpected fetch/sanitize failure — log for server observability and
      // degrade gracefully to the PDF / "no in-app version" fallback below
      // instead of dead-ending the reader.
      console.error("reader: html load failed for", paper.arxiv_id, e);
    }
  }

  if (cachedHtml) return htmlResponse(cachedHtml);

  // --- Fallbacks ---
  if (paper.pdf_url) {
    return NextResponse.json({ kind: "pdf", pdfUrl: paper.pdf_url, title });
  }
  return NextResponse.json({ kind: "none", sourceUrl: paper.source_url, pdfUrl: null, title });
}
