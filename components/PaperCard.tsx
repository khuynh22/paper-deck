import Link from "next/link";
import { Card, Badge, Chip, LinkButton } from "@/components/ui";
import { StarButton } from "@/components/StarButton";
import type { PaperRow } from "@/lib/types";

function authorLine(authors: string[]): string {
  if (authors.length === 0) return "Unknown authors";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

function year(iso: string | null): string | null {
  if (!iso) return null;
  const y = new Date(iso).getFullYear();
  return Number.isFinite(y) ? String(y) : null;
}

export function PaperCard({ paper, starred }: { paper: PaperRow; starred: boolean }) {
  const y = year(paper.published_at);
  return (
    <Card className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-sm sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {paper.categories.slice(0, 3).map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
          {y && <span className="text-xs text-muted-foreground">{y}</span>}
        </div>

        <h3 className="text-base font-semibold leading-snug">
          <Link href={`/paper/${paper.id}`} className="hover:underline">
            {paper.title}
          </Link>
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">{authorLine(paper.authors)}</p>

        {paper.abstract && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground/90">{paper.abstract}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {paper.citations > 0 && <Badge title="Citations">★ {paper.citations.toLocaleString()}</Badge>}
          {paper.hf_upvotes > 0 && <Badge title="Hugging Face upvotes">▲ {paper.hf_upvotes}</Badge>}
          {paper.pwc_stars > 0 && <Badge title="GitHub stars (Papers With Code)">⌥ {paper.pwc_stars.toLocaleString()}</Badge>}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
        <StarButton paperId={paper.id} initialStarred={starred} />
        <LinkButton href={`/reader/${paper.id}`} className="whitespace-nowrap">
          Read
        </LinkButton>
      </div>
    </Card>
  );
}
