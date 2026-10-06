import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReaderView } from "@/components/ReaderView";
import { getPaper } from "@/lib/corpus/query";
import { loadProgress } from "@/app/actions/progress";
import { loadHighlights } from "@/app/actions/highlights";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let user = null;
  try {
    user = await currentUser();
  } catch {
    // not configured
  }
  if (!user) redirect(`/login?next=/reader/${id}`);

  const paper = await getPaper(id);
  if (!paper) notFound();

  const progress = await loadProgress(id);
  const highlights = await loadHighlights(id);

  return (
    <div>
      <div data-reader-header className="sticky top-[58px] z-30 border-b border-line bg-background px-4 py-2.5 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            href={`/paper/${id}`}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[12px] font-medium text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label="Back to paper details"
          >
            {/* ar5iv's unlayered SVG rule puts reader icons behind their controls. */}
            <svg
              aria-hidden="true"
              className="relative shrink-0"
              style={{ zIndex: 0 }}
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5m7 7-7-7 7-7" />
            </svg>
            <span>Back</span>
          </Link>
          <h1 className="min-w-0 flex-1 truncate font-serif text-[15px] font-medium">
            {paper.title}
          </h1>
        </div>
      </div>
      <ReaderView paperId={id} initialProgress={progress} initialHighlights={highlights} />
    </div>
  );
}
