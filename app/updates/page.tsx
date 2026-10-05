import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import {
  parseDiscovery,
  MAX_PAGE,
  type DiscoveryInput,
} from "@/lib/corpus/discovery";
import { getInterests, getInterestUpdates } from "@/lib/interests/query";
import { describeCriteria } from "@/lib/interests/params";
import { InterestManager, UpdateCheck } from "@/components/InterestControls";
import { PaperCard } from "@/components/PaperCard";
import { getStarredIds, getProgressMap } from "@/lib/db/queries";
export const dynamic = "force-dynamic";
export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<DiscoveryInput>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/updates");
  const input = await searchParams;
  const params = parseDiscovery(input);
  const result = await Promise.all([
    getInterests(),
    getInterestUpdates(params.asOf, params.page),
  ]).catch(() => null);
  if (!result)
    return (
      <p role="alert" className="mx-auto max-w-[720px] px-4 py-10">
        Couldn&apos;t load your research updates. Please retry.
      </p>
    );
  const [interests, { updates, hasMore }] = result;
  const [starred, progress] = await Promise.all([
    getStarredIds(user.id),
    getProgressMap(
      user.id,
      updates.map((u) => u.paper.id),
    ),
  ]);
  const href = (page: number) =>
    `/updates?asof=${encodeURIComponent(params.asOf)}&page=${page}`;
  return (
    <div className="mx-auto max-w-[720px] px-4 py-6 sm:px-7">
      <h1 className="font-serif text-[28px] font-medium">Research updates</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Private matches from the shared paper corpus. Save a search or follow a
        category or author name. No email is sent.
      </p>
      <InterestManager interests={interests} />
      <section aria-label="Matching papers">
        <h2 className="font-serif text-xl">Matching papers</h2>
        <UpdateCheck auto={!input.asof || params.invalid} asOf={params.asOf} />
        {params.invalid && <p role="alert">Invalid page values were reset.</p>}
        {!updates.length && (
          <p className="py-6 text-sm text-muted-foreground">
            No matches yet. Add or edit an interest, then check again after the
            corpus refreshes.
          </p>
        )}
        {updates.map((u) => (
          <div
            key={u.paper.id}
            data-testid="interest-match"
            className="border-b border-line pt-3"
          >
            {u.is_new && (
              <span className="rounded bg-tint px-2 py-1 text-xs text-accent">
                New match
              </span>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Matched: {u.reasons.map((r) => r.name).join(", ")}
            </p>
            <details className="mt-1 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Why this paper?</summary>
              <ul className="mt-2 space-y-1">
                {u.reasons.map((r) => (
                  <li key={r.id}>
                    {r.name}:{" "}
                    {describeCriteria({
                      q: r.query,
                      topic: r.topic,
                      venue: r.venue,
                      author: r.author,
                      from: r.from ?? "",
                      to: r.to ?? "",
                    })}
                  </li>
                ))}
              </ul>
            </details>
            <PaperCard
              paper={u.paper}
              starred={starred.has(u.paper.id)}
              progressPct={progress.get(u.paper.id) ?? 0}
            />
          </div>
        ))}
        <nav
          aria-label="Update pages"
          className="my-6 flex gap-4 text-sm text-accent underline"
        >
          {params.page > 1 && (
            <Link href={href(params.page - 1)}>Previous page</Link>
          )}
          {hasMore && params.page < MAX_PAGE && (
            <Link href={href(params.page + 1)}>Next page</Link>
          )}
          {hasMore && params.page === MAX_PAGE && (
            <span>Refine your interests to browse further.</span>
          )}
        </nav>
      </section>
    </div>
  );
}
