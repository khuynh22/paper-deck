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
      <div className="sticky top-[58px] z-10 border-b border-hairline bg-background/90 px-4 py-2.5 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            href={`/paper/${id}`}
            className="shrink-0 text-[17px] text-muted-foreground transition-colors hover:text-accent"
            aria-label="Back to paper details"
          >
            ←
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
