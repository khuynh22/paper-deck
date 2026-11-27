import Link from "next/link";
import { PaperCard } from "@/components/PaperCard";
import { ExternalSearch } from "@/components/ExternalSearch";
import { DiscoveryFilters, DiscoveryPages } from "@/components/DiscoveryControls";
import { getDiscoveryPage } from "@/lib/corpus/query";
import { parseDiscovery, hasFilters, type DiscoveryInput } from "@/lib/corpus/discovery";
import { getProgressMap, getStarredIds } from "@/lib/db/queries";
import { currentUser } from "@/lib/auth";
import type { PaperRow } from "@/lib/types";

export const dynamic = "force-dynamic";
const TOPIC_CHIPS = ["world models", "diffusion", "attention", "robotics", "RLHF"];

export default async function SearchPage({ searchParams }: { searchParams: Promise<DiscoveryInput> }) {
  const params = parseDiscovery(await searchParams);
  const q = params.q;
  const selected = Boolean(q || hasFilters(params));
  let papers: PaperRow[] = [];
  let hasMore = false;
  let dbError: string | null = null;
  if (selected) {
    try { ({ papers, hasMore } = await getDiscoveryPage(params, true)); }
    catch (error) { dbError = error instanceof Error ? error.message : String(error); }
  }
  let starred = new Set<string>();
  let progress = new Map<string, number>();
  try {
    const user = await currentUser();
    if (user) [starred, progress] = await Promise.all([getStarredIds(user.id), getProgressMap(user.id, papers.map(p => p.id))]);
  } catch { /* Public search remains available when signed out. */ }

  return (
    <div className="pd-enter mx-auto max-w-[720px] px-4 py-6 sm:px-7">
      <DiscoveryFilters path="/search" params={params} />
      {!selected && <>
        <p className="text-sm text-muted-foreground">Search the corpus or choose filters to narrow your reading list.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {TOPIC_CHIPS.map(chip => <Link key={chip} href={`/search?q=${encodeURIComponent(chip)}`} className="rounded-full border border-line px-3.5 py-1.5 font-mono text-xs text-muted-foreground hover:border-accent hover:text-accent">{chip}</Link>)}
        </div>
      </>}
      {dbError ? <div role="alert" className="mt-8 rounded-xl border border-line bg-card p-6 text-sm">
        <p className="font-medium">Couldn&apos;t run the search.</p>
        <p className="mt-1 text-muted-foreground">Try again shortly. If this continues, check the database migration. Details: {dbError}</p>
      </div> : selected ? <>
        {papers.length === 0 ? <div className="px-5 py-12 text-center">
          <p className="font-serif text-xl font-medium">No papers match this selection</p>
          <p className="mt-2 text-sm text-muted-foreground">Try broader search terms, clear a filter, or return to the first page.</p>
        </div> : <div className="flex flex-col">{papers.map(p => <PaperCard key={p.id} paper={p} starred={starred.has(p.id)} progressPct={progress.get(p.id) ?? 0} />)}</div>}
        <DiscoveryPages path="/search" params={params} count={papers.length} hasMore={hasMore} />
        {q && <ExternalSearch query={q} />}
      </> : null}
    </div>
  );
}
