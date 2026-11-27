import { ContinueShelf } from "@/components/ContinueShelf";
import { FeedTabs } from "@/components/FeedTabs";
import { PaperCard } from "@/components/PaperCard";
import { RefreshButton } from "@/components/RefreshButton";
import { RefreshHealth } from "@/components/RefreshHealth";
import { getDiscoveryPage } from "@/lib/corpus/query";
import { parseDiscovery, type DiscoveryInput } from "@/lib/corpus/discovery";
import { DiscoveryFilters, DiscoveryPages } from "@/components/DiscoveryControls";
import { getProgressMap, getStarredIds } from "@/lib/db/queries";
import { currentUser } from "@/lib/auth";
import { isOwner } from "@/lib/env";
import { type PaperRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function todayLine(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const date = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `${weekday} — ${date}`;
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<DiscoveryInput>;
}) {
  const params = parseDiscovery(await searchParams);
  const tab = params.tab;

  let papers: PaperRow[] = [];
  let dbError: string | null = null;
  let hasMore = false;
  try {
    ({ papers, hasMore } = await getDiscoveryPage(params));
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  let user = null;
  let starred = new Set<string>();
  let progress = new Map<string, number>();
  let owner = false;
  try {
    user = await currentUser();
    if (user) {
      [starred, progress] = await Promise.all([
        getStarredIds(user.id),
        getProgressMap(
          user.id,
          papers.map((p) => p.id),
        ),
      ]);
      owner = isOwner(user.email);
    }
  } catch {
    // not signed in / not configured
  }

  return (
    <div className="pd-enter mx-auto max-w-[720px] px-4 py-6 sm:px-7">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
          {todayLine()}
        </p>
        {owner && <RefreshButton />}
      </div>

      {user && <ContinueShelf userId={user.id} />}
      {owner && <RefreshHealth />}

      <div className="mt-5">
        <FeedTabs active={tab} params={params} />
      </div>
      <DiscoveryFilters path="/" params={params} />

      {dbError ? (
        <div className="mt-8 rounded-xl border border-line bg-card p-6 text-sm">
          <p className="font-medium">Couldn’t load the feed.</p>
          <p className="mt-1 text-muted-foreground">
            Make sure Supabase is configured (see <code>.env.example</code>) and the schema migration
            has been applied. Details: {dbError}
          </p>
        </div>
      ) : papers.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-5 py-16 text-center">
          <p className="font-serif text-xl font-medium">No papers match this selection</p>
          <p className="max-w-[340px] text-sm leading-relaxed text-muted-foreground">
            Try broader filters or return to the first page. New papers appear after a corpus refresh.
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
      {!dbError && <DiscoveryPages path="/" params={params} count={papers.length} hasMore={hasMore} />}
    </div>
  );
}
