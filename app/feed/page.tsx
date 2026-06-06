import { FeedTabs } from "@/components/FeedTabs";
import { PaperCard } from "@/components/PaperCard";
import { RefreshButton } from "@/components/RefreshButton";
import { getFeed } from "@/lib/corpus/query";
import { getStarredIds } from "@/lib/db/queries";
import { currentUser } from "@/lib/auth";
import { isOwner } from "@/lib/env";
import { FEED_TABS, type FeedTab, type PaperRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function resolveTab(value: string | undefined): FeedTab {
  return FEED_TABS.includes(value as FeedTab) ? (value as FeedTab) : "latest";
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = resolveTab((await searchParams).tab);

  let papers: PaperRow[] = [];
  let dbError: string | null = null;
  try {
    papers = await getFeed(tab);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  let starred = new Set<string>();
  let owner = false;
  try {
    const user = await currentUser();
    if (user) {
      starred = await getStarredIds(user.id);
      owner = isOwner(user.email);
    }
  } catch {
    // not signed in / not configured
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Papers</h1>
          <p className="text-sm text-muted-foreground">Latest, trending, and famous AI/ML research.</p>
        </div>
        {owner && <RefreshButton />}
      </div>

      <FeedTabs active={tab} />

      {dbError ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-6 text-sm">
          <p className="font-medium">Couldn’t load the feed.</p>
          <p className="mt-1 text-muted-foreground">
            Make sure Supabase is configured (see <code>.env.example</code>) and the schema migration
            has been applied. Details: {dbError}
          </p>
        </div>
      ) : papers.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="font-medium">No papers yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The corpus is empty. Trigger a refresh (owner) or run the cron endpoint to pull papers.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {papers.map((p) => (
            <PaperCard key={p.id} paper={p} starred={starred.has(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
