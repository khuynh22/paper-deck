import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReaderView } from "@/components/ReaderView";
import { getPaper } from "@/lib/corpus/query";
import { loadProgress } from "@/app/actions/progress";
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

  return (
    <div>
      <div className="sticky top-14 z-10 border-b border-border bg-background/90 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href={`/paper/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Details
          </Link>
          <h1 className="truncate text-sm font-medium">{paper.title}</h1>
        </div>
      </div>
      <ReaderView paperId={id} initialProgress={progress} />
    </div>
  );
}
