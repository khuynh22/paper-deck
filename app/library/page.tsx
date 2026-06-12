import Link from "next/link";
import { PaperCard } from "@/components/PaperCard";
import { currentUser } from "@/lib/auth";
import { getProgressMap, getStarredPapers } from "@/lib/db/queries";
import type { PaperRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  let user = null;
  try {
    user = await currentUser();
  } catch {
    // not configured
  }

  if (!user) {
    return (
      <div className="pd-enter mx-auto flex max-w-[720px] flex-col items-center gap-1.5 px-4 py-20 text-center">
        <h1 className="font-serif text-xl font-medium">Your library</h1>
        <p className="max-w-[340px] text-sm leading-relaxed text-muted-foreground">
          Sign in to see your saved papers, synced across your devices.
        </p>
        <Link
          href="/login"
          className="mt-3.5 flex h-[38px] items-center rounded-full border border-line px-4.5 text-[13.5px] font-medium text-accent transition-colors hover:border-accent"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const papers: PaperRow[] = await getStarredPapers(user.id);
  const progress = await getProgressMap(
    user.id,
    papers.map((p) => p.id),
  );

  return (
    <div className="pd-enter mx-auto max-w-[720px] px-4 py-6 sm:px-7">
      <div className="border-b border-line pb-4">
        <h1 className="mt-1.5 font-serif text-[26px] font-medium tracking-tight sm:text-[32px]">
          Library
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {papers.length === 1 ? "1 paper saved to read" : `${papers.length} papers saved to read`}
        </p>
      </div>

      {papers.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-5 py-16 text-center">
          <p className="font-serif text-xl font-medium">Nothing saved yet</p>
          <p className="max-w-[340px] text-sm leading-relaxed text-muted-foreground">
            Save papers from the feed and they’ll be waiting here, synced across your devices.
          </p>
          <Link
            href="/"
            className="mt-3.5 flex h-[38px] items-center rounded-full border border-line px-4.5 text-[13.5px] font-medium text-accent transition-colors hover:border-accent"
          >
            Browse the feed
          </Link>
        </div>
      ) : (
        <div className="flex flex-col">
          {papers.map((p) => (
            <PaperCard key={p.id} paper={p} starred progressPct={progress.get(p.id) ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}
