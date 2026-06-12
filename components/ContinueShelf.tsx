import Link from "next/link";
import { Kicker } from "@/components/ui";
import { getContinueReading } from "@/lib/db/queries";
import { ClearReadingItemButton, ClearReadingAllButton } from "@/components/ClearReading";

export async function ContinueShelf({ userId }: { userId: string }) {
  const items = await getContinueReading(userId);
  if (items.length === 0) return null;

  return (
    <section className="mt-5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Kicker>Continue reading</Kicker>
        <ClearReadingAllButton />
      </div>
      <div className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {items.map(({ paper, scrollPct }) => {
          const pct = Math.round(Math.min(1, Math.max(0, scrollPct)) * 100);
          return (
            <div key={paper.id} className="group relative w-[226px] shrink-0">
              <Link
                href={`/reader/${paper.id}`}
                className="flex h-full flex-col gap-2 rounded-[14px] border border-line bg-card px-4 py-3.5 transition-colors hover:border-accent"
              >
                <span className="font-mono text-[10.5px] tracking-wide text-accent">
                  {pct}% READ
                </span>
                <span className="line-clamp-3 pr-4 font-serif text-[15.5px] font-medium leading-[1.32] text-ink">
                  {paper.title}
                </span>
                <span className="mt-auto block h-[3px] overflow-hidden rounded-full bg-tint">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </span>
              </Link>
              <ClearReadingItemButton paperId={paper.id} title={paper.title} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
