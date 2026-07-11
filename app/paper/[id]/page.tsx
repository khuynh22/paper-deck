import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Kicker } from "@/components/ui";
import { StarButton } from "@/components/StarButton";
import { ShareButton } from "@/components/ShareButton";
import { getPaper } from "@/lib/corpus/query";
import { getStarredIds } from "@/lib/db/queries";
import { loadProgress } from "@/app/actions/progress";
import { currentUser } from "@/lib/auth";
import { dateLine, fmtK } from "@/lib/format";
import { paperMetadata } from "@/lib/meta";
import { paperPath, paperUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** One paper fetch per request, shared by generateMetadata and the page body. */
const loadPaper = cache(getPaper);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const paper = await loadPaper(id);
  if (!paper) return { title: "Paper not found" };
  return paperMetadata(paper, paperUrl(paper.id));
}

export default async function PaperDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const paper = await loadPaper(id);
  if (!paper) notFound();

  let starred = false;
  let progressPct = 0;
  try {
    const user = await currentUser();
    if (user) {
      starred = (await getStarredIds(user.id)).has(paper.id);
      progressPct = (await loadProgress(paper.id))?.scrollPct ?? 0;
    }
  } catch {
    // not signed in
  }

  const pct = Math.round(Math.min(1, Math.max(0, progressPct)) * 100);
  const date = dateLine(paper.published_at);
  const metaParts = [paper.arxiv_id ? `arXiv ${paper.arxiv_id}` : null, date].filter(Boolean);
  const statsParts = [
    paper.citations > 0 ? `${paper.citations.toLocaleString()} citations` : null,
    paper.hf_upvotes > 0 ? `▲ ${paper.hf_upvotes} upvotes` : null,
    paper.pwc_stars > 0 ? `${fmtK(paper.pwc_stars)} repo stars` : null,
  ].filter(Boolean);

  return (
    <article className="pd-enter mx-auto max-w-[720px] px-4 py-6 sm:px-7">
      <Link
        href="/"
        className="-ml-1 flex w-fit items-center gap-1.5 px-1 py-1.5 font-mono text-xs tracking-wide text-muted-foreground transition-colors hover:text-accent"
      >
        ← Feed
      </Link>

      <p className="mt-5 font-mono text-xs tracking-wide text-faint">
        <span className="text-accent">{paper.categories.slice(0, 3).join(" · ")}</span>
        {metaParts.length > 0 && <>&nbsp;&nbsp;{metaParts.join(" · ")}</>}
      </p>

      <h1 className="mt-3 font-serif text-[27px] font-medium leading-[1.14] tracking-tight sm:text-[40px] text-pretty">
        {paper.title}
      </h1>

      <p className="mt-3.5 text-[15px] leading-relaxed text-muted-foreground text-pretty">
        {paper.authors.join(", ") || "Unknown authors"}
      </p>

      {statsParts.length > 0 && (
        <p className="mt-2.5 font-mono text-xs tracking-wide text-faint">
          {statsParts.join(" · ")}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <Link
          href={`/reader/${paper.id}`}
          className="flex h-[42px] items-center gap-2 rounded-full bg-accent px-5.5 text-[14.5px] font-semibold text-primary-foreground transition hover:brightness-110"
        >
          {pct > 0 ? `Continue reading · ${pct}%` : "Read paper"}
        </Link>
        <StarButton paperId={paper.id} initialStarred={starred} variant="detail" />
        <ShareButton path={paperPath(paper.id)} title={paper.title} />
        {paper.source_url && (
          <a
            href={paper.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex h-[42px] items-center rounded-full px-3.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-tint hover:text-accent"
          >
            arXiv ↗
          </a>
        )}
        {paper.pdf_url && (
          <a
            href={paper.pdf_url}
            target="_blank"
            rel="noreferrer"
            className="flex h-[42px] items-center rounded-full px-3.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-tint hover:text-accent"
          >
            PDF ↗
          </a>
        )}
      </div>

      {paper.abstract && (
        <section className="mt-9">
          <Kicker>Abstract</Kicker>
          <p className="mt-3 font-serif text-[17.5px] leading-[1.72] text-ink text-pretty">
            {paper.abstract}
          </p>
        </section>
      )}
    </article>
  );
}
