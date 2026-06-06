"use client";

export function ReaderBar({
  marked,
  onMark,
  onClear,
  progressPct,
  hint,
}: {
  marked: boolean;
  onMark: () => void;
  onClear: () => void;
  progressPct: number;
  hint?: string | null;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
        <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-muted sm:block">
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progressPct)) * 100)}%` }}
          />
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {Math.round(progressPct * 100)}%
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        <div className="ml-auto flex items-center gap-2">
          {marked && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Clear mark
            </button>
          )}
          <button
            type="button"
            onClick={onMark}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            I finished here
          </button>
        </div>
      </div>
    </div>
  );
}
