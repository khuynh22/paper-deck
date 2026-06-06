import Link from "next/link";
import { PaperCard } from "@/components/PaperCard";
import { LinkButton } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { getStarredPapers } from "@/lib/db/queries";
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
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">Your library</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to see your starred papers.</p>
        <LinkButton href="/login" className="mt-6">
          Sign in
        </LinkButton>
      </div>
    );
  }

  const papers: PaperRow[] = await getStarredPapers(user.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
      <p className="text-sm text-muted-foreground">Papers you’ve starred to read.</p>

      {papers.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="font-medium">No stars yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Star papers from the feed and they’ll show up here.
          </p>
          <Link href="/feed" className="mt-4 inline-block text-sm text-primary hover:underline">
            Browse the feed →
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {papers.map((p) => (
            <PaperCard key={p.id} paper={p} starred />
          ))}
        </div>
      )}
    </div>
  );
}
