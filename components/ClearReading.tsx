"use client";

import { useTransition } from "react";
import { clearProgress, clearAllReading } from "@/app/actions/progress";

/** Small × overlaid on a "Continue reading" card to remove that paper from the shelf. */
export function ClearReadingItemButton({ paperId, title }: { paperId: string; title: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Remove “${title}” from continue reading`}
      title="Remove from continue reading"
      disabled={pending}
      onClick={() => startTransition(() => clearProgress(paperId))}
      className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** Clears the whole "Continue reading" shelf. */
export function ClearReadingAllButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => clearAllReading())}
      className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      {pending ? "Clearing…" : "Clear all"}
    </button>
  );
}
