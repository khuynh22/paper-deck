import Link from "next/link";
import { FEED_TABS, type FeedTab } from "@/lib/types";

const LABELS: Record<FeedTab, string> = {
  latest: "Latest",
  trending: "Trending",
  famous: "Famous",
};

const HINTS: Record<FeedTab, string> = {
  latest: "freshest arXiv submissions",
  trending: "ranked by community upvotes",
  famous: "ranked by citations",
};

export function FeedTabs({ active }: { active: FeedTab }) {
  return (
    <nav className="flex items-baseline gap-6 border-b border-line">
      {FEED_TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={tab === "latest" ? "/" : `/?tab=${tab}`}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px border-b-2 px-px pb-[11px] pt-2 text-[14.5px] tracking-wide transition-colors ${
              isActive
                ? "border-accent font-semibold text-ink"
                : "border-transparent font-normal text-muted-foreground hover:text-ink"
            }`}
          >
            {LABELS[tab]}
          </Link>
        );
      })}
      <span className="ml-auto hidden font-mono text-[11px] text-faint min-[540px]:inline">
        {HINTS[active]}
      </span>
    </nav>
  );
}
