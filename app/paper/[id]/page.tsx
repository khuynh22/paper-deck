import { notFound } from "next/navigation";
import { LinkButton, Chip, Badge } from "@/components/ui";
import { StarButton } from "@/components/StarButton";
import { getPaper } from "@/lib/corpus/query";
import { getStarredIds } from "@/lib/db/queries";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PaperDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const paper = await getPaper(id);
  if (!paper) notFound();

  let starred = false;
  try {
    const user = await currentUser();
    if (user) starred = (await getStarredIds(user.id)).has(paper.id);
  } catch {
    // not signed in
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center gap-1.5">
        {paper.categories.map((c) => (
          <Chip key={c}>{c}</Chip>
        ))}
      </div>

      <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">{paper.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{paper.authors.join(", ") || "Unknown authors"}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {paper.citations > 0 && <Badge title="Citations">★ {paper.citations.toLocaleString()}</Badge>}
        {paper.hf_upvotes > 0 && <Badge title="Hugging Face upvotes">▲ {paper.hf_upvotes}</Badge>}
        {paper.pwc_stars > 0 && <Badge title="GitHub stars">⌥ {paper.pwc_stars.toLocaleString()}</Badge>}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <LinkButton href={`/reader/${paper.id}`}>Read in app</LinkButton>
        {paper.source_url && (
          <LinkButton href={paper.source_url} variant="outline" target="_blank" rel="noreferrer">
            View on arXiv
          </LinkButton>
        )}
        {paper.pdf_url && (
          <LinkButton href={paper.pdf_url} variant="outline" target="_blank" rel="noreferrer">
            PDF
          </LinkButton>
        )}
        <StarButton paperId={paper.id} initialStarred={starred} />
      </div>

      {paper.abstract && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Abstract
          </h2>
          <p className="mt-2 leading-relaxed">{paper.abstract}</p>
        </section>
      )}
    </article>
  );
}
