import Link from "next/link";
import { FEED_TABS, type FeedTab } from "@/lib/types";

const LABELS: Record<FeedTab, string> = {
  latest: "Latest",
  trending: "Trending",
  famous: "Famous",
};

const HINTS: Record<FeedTab, string> = {
  latest: "Freshest arXiv submissions",
  trending: "What people are upvoting now",
  famous: "Most cited / influential",
};

export function FeedTabs({ active }: { active: FeedTab }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
      {FEED_TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={`/feed?tab=${tab}`}
            title={HINTS[tab]}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {LABELS[tab]}
          </Link>
        );
      })}
    </div>
  );
}
