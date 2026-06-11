import Link from "next/link";
import { getContinueReading } from "@/lib/db/queries";
import { ClearReadingItemButton, ClearReadingAllButton } from "@/components/ClearReading";

export async function ContinueShelf({ userId }: { userId: string }) {
  const items = await getContinueReading(userId);
  if (items.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Continue reading</h2>
        <ClearReadingAllButton />
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {items.map(({ paper, scrollPct }) => {
          const pct = Math.round(Math.min(1, Math.max(0, scrollPct)) * 100);
          return (
            <div key={paper.id} className="group relative w-64 shrink-0">
              <Link
                href={`/reader/${paper.id}`}
                className="flex h-full flex-col justify-between rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-sm"
              >
                <p className="line-clamp-3 pr-6 text-sm font-medium leading-snug">{paper.title}</p>
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {paper.authors.slice(0, 2).join(", ") || "Unknown"}
                    </p>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
              <ClearReadingItemButton paperId={paper.id} title={paper.title} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
