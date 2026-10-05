import { ExportControls } from "@/components/ExportControls";
import Link from "next/link";
import { PaperCard } from "@/components/PaperCard";
import {
  CollectionManager,
  PaperLibraryControls,
} from "@/components/LibraryControls";
import { currentUser } from "@/lib/auth";
import { getCollections, getLibraryPage } from "@/lib/library/query";
import {
  parseLibrary,
  libraryHref,
  MAX_PAGE,
  STATUS_LABELS,
} from "@/lib/library/params";
import type { DiscoveryInput } from "@/lib/corpus/discovery";

export const dynamic = "force-dynamic";
const field =
  "mt-1 w-full rounded-md border border-line bg-card px-2 py-2 text-sm";
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<DiscoveryInput>;
}) {
  const user = await currentUser().catch(() => null);
  if (!user)
    return (
      <div className="mx-auto max-w-[720px] px-4 py-20 text-center">
        <h1 className="font-serif text-xl">Your library</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to see your saved papers, synced across your devices.
        </p>
        <Link href="/login" className="mt-4 inline-block text-accent underline">
          Sign in
        </Link>
      </div>
    );
  const params = parseLibrary(await searchParams);
  const result = await Promise.all([
    getLibraryPage(params),
    getCollections(user.id),
  ]).catch(() => null);
  if (!result)
    return (
      <div role="alert" className="mx-auto max-w-[720px] px-4 py-10">
        Couldn&apos;t load your library. Please try again.
      </div>
    );
  const [{ items, hasMore }, collections] = result;
  const selected = collections.find(
    (collection) => collection.id === params.collection,
  );
  return (
    <div className="pd-enter mx-auto max-w-[720px] px-4 py-6 sm:px-7">
      <h1 className="font-serif text-[28px] font-medium">Library</h1>
      <nav
        aria-label="Collections"
        className="mt-3 flex flex-wrap gap-3 text-sm"
      >
        <Link
          aria-current={!params.collection ? "page" : undefined}
          className="text-accent underline"
          href={libraryHref(params, { collection: "", page: 1 })}
        >
          All saved
        </Link>
        {collections.map((collection) => (
          <Link
            key={collection.id}
            aria-current={
              params.collection === collection.id ? "page" : undefined
            }
            className="text-accent underline"
            href={libraryHref(params, { collection: collection.id, page: 1 })}
          >
            {collection.name}
          </Link>
        ))}
      </nav>
      <form
        action="/library"
        method="get"
        role="search"
        className="my-5 space-y-3"
      >
        {params.collection && (
          <input type="hidden" name="collection" value={params.collection} />
        )}
        <label className="block text-sm">
          Search saved papers
          <input
            type="search"
            name="q"
            maxLength={300}
            defaultValue={params.q}
            className={field}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Status
            <select
              name="status"
              defaultValue={params.status}
              className={field}
            >
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Sort
            <select name="sort" defaultValue={params.sort} className={field}>
              <option value="newest">Newest saved</option>
              <option value="oldest">Oldest saved</option>
              <option value="title">Title</option>
            </select>
          </label>
        </div>
        <button className="rounded-full bg-accent px-4 py-2 text-sm text-white">
          Apply library filters
        </button>
        {params.invalid && (
          <p role="alert" className="text-sm text-danger">
            Invalid library filters or page values were reset.
          </p>
        )}
      </form>
      <ExportControls
        papers={items.map((item) => ({
          id: item.paper.id,
          title: item.paper.title,
        }))}
      />
      <CollectionManager collections={collections} params={params} />
      {params.collection && !selected && (
        <p role="alert" className="text-sm text-danger">
          This collection is unavailable. Choose All saved to continue.
        </p>
      )}
      <p className="mb-3 text-sm text-muted-foreground">
        Showing {items.length} {items.length === 1 ? "paper" : "papers"}
        {selected ? ` in ${selected.name}` : ""} · Page {params.page}
      </p>
      {items.length === 0 ? (
        <div className="py-10 text-center">
          <p className="font-serif text-xl">No saved papers match this view</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try broader filters or save papers from the feed.
          </p>
          <Link href="/" className="mt-3 inline-block text-accent underline">
            Browse the feed
          </Link>
        </div>
      ) : (
        items.map((item) => (
          <section key={item.paper.id} aria-label={item.paper.title}>
            <PaperCard paper={item.paper} starred progressPct={item.read_pct} />
            <PaperLibraryControls
              paperId={item.paper.id}
              status={item.reading_status}
              collections={collections}
              memberships={item.collection_ids}
            />
          </section>
        ))
      )}
      <nav
        aria-label="Library pages"
        className="my-6 flex gap-5 text-sm text-accent underline"
      >
        {params.page > 1 && (
          <Link
            rel="prev"
            href={libraryHref(params, { page: params.page - 1 })}
          >
            Previous page
          </Link>
        )}
        {hasMore && params.page < MAX_PAGE && (
          <Link
            rel="next"
            href={libraryHref(params, { page: params.page + 1 })}
          >
            Next page
          </Link>
        )}
        {hasMore && params.page === MAX_PAGE && (
          <span>Refine your search to browse further.</span>
        )}
      </nav>
    </div>
  );
}
