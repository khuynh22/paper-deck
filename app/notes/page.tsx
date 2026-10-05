import { ExportControls } from "@/components/ExportControls";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getNotesPage, getNotePapers } from "@/lib/notes/query";
import { parseNotes, notesHref } from "@/lib/notes/params";
import { MAX_PAGE, type DiscoveryInput } from "@/lib/corpus/discovery";
import { NoteCard } from "@/components/NoteCard";
export const dynamic = "force-dynamic";
export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<DiscoveryInput>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/notes");
  const params = parseNotes(await searchParams);
  const result = await Promise.all([
    getNotesPage(params),
    getNotePapers(),
  ]).catch(() => null);
  if (!result)
    return (
      <p role="alert" className="mx-auto max-w-[720px] px-4 py-10">
        Couldn&apos;t load your notes. Please try again.
      </p>
    );
  const [{ notes, hasMore }, papers] = result;
  return (
    <div className="mx-auto max-w-[720px] px-4 py-6 sm:px-7">
      <h1 className="font-serif text-[28px] font-medium">My Notes</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your private highlights and notes across papers.
      </p>
      <ExportControls notes />
      <form
        action="/notes"
        method="get"
        role="search"
        className="my-5 space-y-3"
      >
        <label className="block text-sm">
          Search notes
          <input
            type="search"
            name="q"
            maxLength={300}
            defaultValue={params.q}
            placeholder="Quote, note or paper title"
            className="mt-1 w-full rounded border border-line bg-card px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Paper
          <select
            name="paper"
            defaultValue={params.paper}
            className="mt-1 w-full rounded border border-line bg-card px-3 py-2"
          >
            <option value="">All papers</option>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-full bg-accent px-4 py-2 text-sm text-white">
          Search notes
        </button>
        {params.invalid && (
          <p role="alert" className="text-sm text-danger">
            Invalid notes filters or page values were reset.
          </p>
        )}
      </form>
      <p className="text-sm text-muted-foreground">
        Showing {notes.length} {notes.length === 1 ? "highlight" : "highlights"}{" "}
        · Page {params.page} · Recently updated first
      </p>
      {notes.length ? (
        notes.map((entry) => <NoteCard key={entry.id} entry={entry} />)
      ) : (
        <div className="py-10 text-center">
          <p className="font-serif text-xl">No highlights match this view</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try a broader search or highlight a passage in the reader.
          </p>
        </div>
      )}
      <nav
        aria-label="Notes pages"
        className="my-6 flex gap-5 text-sm text-accent underline"
      >
        {params.page > 1 && (
          <Link href={notesHref(params, { page: params.page - 1 })}>
            Previous page
          </Link>
        )}
        {hasMore && params.page < MAX_PAGE && (
          <Link href={notesHref(params, { page: params.page + 1 })}>
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
