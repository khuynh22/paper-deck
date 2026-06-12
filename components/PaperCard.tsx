import Link from "next/link";
import { StarButton } from "@/components/StarButton";
import { authorLine, dateLine, signalLine } from "@/lib/format";
import type { PaperRow } from "@/lib/types";

/**
 * One row of the reading list — divider-separated, no box. The title links to
 * the detail page; "Read" jumps straight into the reader.
 */
export function PaperCard({
  paper,
  starred,
  progressPct = 0,
}: {
  paper: PaperRow;
  starred: boolean;
  progressPct?: number;
}) {
  const date = dateLine(paper.published_at);
  const pct = Math.round(Math.min(1, Math.max(0, progressPct)) * 100);

  return (
    <article className="flex flex-col gap-1.5 border-b border-hairline py-5">
      <div className="flex items-baseline gap-3 font-mono text-[11.5px] tracking-wide">
        <span className="text-accent">{paper.categories.slice(0, 2).join(" · ") || "paper"}</span>
        {date && <span className="text-faint">{date}</span>}
        <span className="ml-auto whitespace-nowrap text-faint">{signalLine(paper)}</span>
      </div>

      <h3 className="font-serif text-lg font-medium leading-[1.28] tracking-tight sm:text-[21.5px] text-pretty">
        <Link href={`/paper/${paper.id}`} className="transition-colors hover:text-accent">
          {paper.title}
        </Link>
      </h3>

      <p className="text-[13.5px] text-muted-foreground">{authorLine(paper.authors)}</p>

      {paper.abstract && (
        <p className="mt-0.5 line-clamp-2 text-[14.5px] leading-relaxed text-muted-foreground text-pretty">
          {paper.abstract}
        </p>
      )}

      <div className="-ml-2.5 mt-1.5 flex items-center gap-0.5">
        <StarButton paperId={paper.id} initialStarred={starred} />
        <Link
          href={`/reader/${paper.id}`}
          className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-tint hover:text-accent"
        >
          Read →
        </Link>
        {pct > 0 && (
          <span className="ml-auto flex items-center gap-2">
            <span className="block h-[3px] w-14 overflow-hidden rounded-full bg-tint">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </span>
            <span className="font-mono text-[10.5px] text-faint">{pct}%</span>
          </span>
        )}
      </div>
    </article>
  );
}
