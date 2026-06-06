import Link from "next/link";
import { getContinueReading } from "@/lib/db/queries";

export async function ContinueShelf({ userId }: { userId: string }) {
  const items = await getContinueReading(userId);
  if (items.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">Continue reading</h2>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {items.map(({ paper, scrollPct }) => (
          <Link
            key={paper.id}
            href={`/reader/${paper.id}`}
            className="flex w-64 shrink-0 flex-col justify-between rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-sm"
          >
            <p className="line-clamp-3 text-sm font-medium leading-snug">{paper.title}</p>
            <div className="mt-3">
              <p className="mb-2 truncate text-xs text-muted-foreground">
                {paper.authors.slice(0, 2).join(", ") || "Unknown"}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.round(Math.min(1, Math.max(0, scrollPct)) * 100)}%` }}
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
