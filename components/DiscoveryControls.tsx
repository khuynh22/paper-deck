import Link from "next/link";
import { discoveryHref, MAX_PAGE, type DiscoveryParams } from "@/lib/corpus/discovery";

const field = "mt-1 w-full rounded-md border border-line bg-card px-2.5 py-2 text-sm text-ink";
export function DiscoveryFilters({ path, params }: { path: "/" | "/search"; params: DiscoveryParams }) {
  return (
    <form action={path} method="get" role={path === "/search" ? "search" : undefined} className="my-5 space-y-3">
      {path === "/search" && <label className="block text-sm font-medium">Search papers<input type="search" name="q" defaultValue={params.q} maxLength={300} placeholder="Titles, authors, topics or arXiv ID" className={field} /></label>}
      {path === "/" && <input type="hidden" name="tab" value={params.tab} />}
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-medium">Filter papers</legend>
        <label className="text-xs text-muted-foreground">Topic / category<input name="topic" defaultValue={params.topic} maxLength={64} placeholder="e.g. cs.AI" className={field} /></label>
        <label className="text-xs text-muted-foreground">Venue<input name="venue" defaultValue={params.venue} maxLength={120} placeholder="e.g. NeurIPS 2024" className={field} /></label>
        <label className="text-xs text-muted-foreground">Published from<input type="date" name="from" defaultValue={params.from} className={field} /></label>
        <label className="text-xs text-muted-foreground">Published through<input type="date" name="to" defaultValue={params.to} className={field} /></label>
      </fieldset>
      <div className="flex items-center gap-4 text-sm">
        <button type="submit" className="rounded-full bg-accent px-4 py-2 font-medium text-white">Apply filters</button>
        <Link href={path === "/search" ? `/search?q=${encodeURIComponent(params.q)}` : params.tab === "latest" ? "/" : `/?tab=${params.tab}`} className="text-muted-foreground underline">Clear filters</Link>
      </div>
      {params.invalid && <p role="alert" className="text-sm text-danger">Some invalid filters or page values were reset. Check your selection.</p>}
    </form>
  );
}

export function DiscoveryPages({ path, params, count, hasMore }: { path: "/" | "/search"; params: DiscoveryParams; count: number; hasMore: boolean }) {
  return (
    <nav aria-label="Results pages" className="my-6 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">Showing {count} {count === 1 ? "paper" : "papers"} · Page {params.page}</p>
      <div className="flex gap-4">
        {params.page > 1 && <Link rel="prev" className="font-medium text-accent underline" href={discoveryHref(path, params, { page: params.page - 1 })}>Previous page</Link>}
        {hasMore && params.page < MAX_PAGE && <Link rel="next" className="font-medium text-accent underline" href={discoveryHref(path, params, { page: params.page + 1 })}>Next page</Link>}
        {hasMore && params.page === MAX_PAGE && <span>Refine filters to browse further.</span>}
      </div>
    </nav>
  );
}
