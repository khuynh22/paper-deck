import Link from "next/link";
import { FEED_TABS, type FeedTab } from "@/lib/types";

const LABELS: Record<FeedTab, string> = {
  latest: "Latest",
  trending: "Trending",
  famous: "Famous",
};

const HINTS: Record<FeedTab, { text: string; href?: string }> = {
  latest: { text: "freshest arXiv submissions" },
  trending: { text: "ranked by community upvotes", href: "https://huggingface.co/papers" },
  famous: { text: "ranked by citations" },
};

export function FeedTabs({ active }: { active: FeedTab }) {
  const hint = HINTS[active];
  const hintClass = "ml-auto hidden font-mono text-[11px] text-faint min-[540px]:inline";
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
      {hint.href ? (
        <a
          href={hint.href}
          target="_blank"
          rel="noreferrer"
          className={`${hintClass} transition-colors hover:text-muted-foreground hover:underline`}
        >
          {hint.text}
        </a>
      ) : (
        <span className={hintClass}>{hint.text}</span>
      )}
    </nav>
  );
}
