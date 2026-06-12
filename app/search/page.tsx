import Link from "next/link";
import { PaperCard } from "@/components/PaperCard";
import { ExternalSearch } from "@/components/ExternalSearch";
import { getPaperByArxivId, searchCorpus } from "@/lib/corpus/query";
import { extractArxivId } from "@/lib/sources/arxiv";
import { getProgressMap, getStarredIds } from "@/lib/db/queries";
import { currentUser } from "@/lib/auth";
import type { PaperRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const TOPIC_CHIPS = ["world models", "diffusion", "attention", "robotics", "RLHF"];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q ?? "").trim();

  let papers: PaperRow[] = [];
  let dbError: string | null = null;
  if (q) {
    try {
      // A pasted arXiv id or URL looks up that exact paper; full-text search
      // would never match a URL. Falls through to the arXiv pull when absent.
      const arxivId = extractArxivId(q);
      if (arxivId) {
        const hit = await getPaperByArxivId(arxivId);
        papers = hit ? [hit] : [];
      } else {
        papers = await searchCorpus(q);
      }
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  }

  let starred = new Set<string>();
  let progress = new Map<string, number>();
  try {
    const user = await currentUser();
    if (user) {
      [starred, progress] = await Promise.all([
        getStarredIds(user.id),
        getProgressMap(
          user.id,
          papers.map((p) => p.id),
        ),
      ]);
    }
  } catch {
    // not signed in / not configured
  }

  return (
    <div className="pd-enter mx-auto max-w-[720px] px-4 py-6 sm:px-7">
      <form action="/search" method="get" role="search">
        <input
          type="search"
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Search titles, authors, topics…"
          aria-label="Search papers"
          className="w-full border-b-2 border-line bg-transparent pb-3.5 pt-2.5 font-serif text-[21px] font-medium text-ink outline-none transition-colors placeholder:text-faint focus:border-accent sm:text-[27px]"
        />
      </form>

      {!q && (
        <div className="mt-4.5 flex flex-wrap gap-2">
          {TOPIC_CHIPS.map((chip) => (
            <Link
              key={chip}
              href={`/search?q=${encodeURIComponent(chip)}`}
              className="rounded-full border border-line px-3.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent"
            >
              {chip}
            </Link>
          ))}
        </div>
      )}

      {q && !dbError && papers.length > 0 && (
        <p className="mt-3.5 font-mono text-[11.5px] tracking-wide text-faint">
          {papers.length === 1 ? "1 result in your corpus" : `${papers.length} results in your corpus`}
        </p>
      )}

      {dbError ? (
        <div className="mt-8 rounded-xl border border-line bg-card p-6 text-sm">
          <p className="font-medium">Couldn’t run the search.</p>
          <p className="mt-1 text-muted-foreground">
            Make sure Supabase is configured and migration <code>0002_search.sql</code> has been
            applied. Details: {dbError}
          </p>
        </div>
      ) : q ? (
        <>
          {papers.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-5 py-16 text-center">
              <p className="font-serif text-xl font-medium">No matches in your corpus</p>
              <p className="max-w-[340px] text-sm leading-relaxed text-muted-foreground">
                Nothing here for “{q}” yet. Try a broader term, or pull fresh matches from arXiv
                below.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {papers.map((p) => (
                <PaperCard
                  key={p.id}
                  paper={p}
                  starred={starred.has(p.id)}
                  progressPct={progress.get(p.id) ?? 0}
                />
              ))}
            </div>
          )}

          <ExternalSearch query={q} />
        </>
      ) : null}
    </div>
  );
}
