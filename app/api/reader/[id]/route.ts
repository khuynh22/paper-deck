import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/db/server";
import { serviceClient } from "@/lib/db/service";
import { loadReaderHtml } from "@/lib/reader/fetchHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Uncached papers are fetched + sanitized live; a few large ar5iv-fallback docs
// (no native arXiv HTML) can take several seconds. Lift the default ~10s cap.
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

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

  // --- Cached sanitized HTML ---
  const { data: cached } = await db
    .from("paper_content")
    .select("kind, sanitized_html")
    .eq("paper_id", id)
    .maybeSingle();

  if (cached?.kind === "html" && cached.sanitized_html) {
    return NextResponse.json({ kind: "html", html: cached.sanitized_html, pdfUrl: paper.pdf_url, title });
  }

  // --- Fetch + sanitize HTML on demand, then cache ---
  if (paper.arxiv_id) {
    const result = await loadReaderHtml(paper.arxiv_id);
    if (result.kind === "html") {
      try {
        serviceClient()
          .from("paper_content")
          .upsert({ paper_id: id, kind: "html", sanitized_html: result.html })
          .then(() => {});
      } catch {
        // no service key configured — serve uncached
      }
      return NextResponse.json({ kind: "html", html: result.html, pdfUrl: paper.pdf_url, title });
    }
  }

  // --- Fallbacks ---
  if (paper.pdf_url) {
    return NextResponse.json({ kind: "pdf", pdfUrl: paper.pdf_url, title });
  }
  return NextResponse.json({ kind: "none", sourceUrl: paper.source_url, pdfUrl: null, title });
}
