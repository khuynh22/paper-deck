import Link from "next/link";
import type { Highlight } from "@/lib/types";

export function HighlightFallback({
  highlight,
  floating = false,
}: {
  highlight?: Highlight;
  floating?: boolean;
}) {
  return (
    <aside
      role="status"
      aria-label="Passage unavailable"
      className={`${floating ? "fixed inset-x-4 top-28 z-40 max-h-[60vh] overflow-auto shadow-lg" : "mx-auto my-4"} max-w-3xl rounded-xl border border-line bg-card p-4`}
    >
      <p className="font-medium">This saved passage could not be located.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        The source may have changed or may no longer be available in this
        reader.
      </p>
      {highlight ? (
        <>
          <blockquote className="my-3 border-l-2 border-accent pl-3 text-sm">
            {highlight.quote}
          </blockquote>
          {highlight.note && (
            <p className="whitespace-pre-wrap text-sm">{highlight.note}</p>
          )}
        </>
      ) : (
        <p className="my-3 text-sm">
          This highlight is unavailable in your account.
        </p>
      )}
      <Link
        href="/notes"
        className="mt-3 inline-block text-sm text-accent underline"
      >
        Back to My Notes
      </Link>
    </aside>
  );
}
