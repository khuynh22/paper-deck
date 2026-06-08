import { PaperCard } from "@/components/PaperCard";
import { SearchBar } from "@/components/SearchBar";
import { ExternalSearch } from "@/components/ExternalSearch";
import { searchCorpus } from "@/lib/corpus/query";
import { getStarredIds } from "@/lib/db/queries";
import { currentUser } from "@/lib/auth";
import type { PaperRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q ?? "").trim();

  let papers: PaperRow[] = [];
  let dbError: string | null = null;
  if (q) {
    try {
      papers = await searchCorpus(q);
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  }

  let starred = new Set<string>();
  try {
    const user = await currentUser();
    if (user) starred = await getStarredIds(user.id);
  } catch {
    // not signed in / not configured
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground">
          {q ? <>Results for “{q}”.</> : "Search your corpus and arXiv for papers."}
        </p>
      </div>

      <SearchBar defaultValue={q} className="mb-6 w-full max-w-xl" />

      {!q ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="font-medium">Search for a paper</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a title, author, or topic — e.g. <em>diffusion models</em>.
          </p>
        </div>
      ) : dbError ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-6 text-sm">
          <p className="font-medium">Couldn’t run the search.</p>
          <p className="mt-1 text-muted-foreground">
            Make sure Supabase is configured and migration <code>0002_search.sql</code> has been
            applied. Details: {dbError}
          </p>
        </div>
      ) : (
        <>
          {papers.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
              <p className="font-medium">No matches in your corpus</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nothing here yet for “{q}”. Pull fresh matches from arXiv below.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {papers.map((p) => (
                <PaperCard key={p.id} paper={p} starred={starred.has(p.id)} />
              ))}
            </div>
          )}

          <ExternalSearch query={q} />
        </>
      )}
    </div>
  );
}
