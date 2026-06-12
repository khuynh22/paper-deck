"use client";

/**
 * Reader progress chrome: a thin accent bar pinned to the very top of the
 * viewport, and a floating pill at the bottom with the mark controls.
 */
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
  const pct = Math.round(Math.min(1, Math.max(0, progressPct)) * 100);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px]">
        <div
          className="h-full bg-accent transition-[width] duration-150 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center bg-gradient-to-t from-background via-background/60 to-transparent px-3.5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-10">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-card py-[5px] pl-4 pr-1.5 shadow-[0_12px_32px_var(--shadow)]">
          <span className="mr-1.5 font-mono text-[11.5px] text-muted-foreground">{pct}%</span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
          {marked && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full px-2.5 py-[7px] text-[12.5px] text-muted-foreground transition-colors hover:bg-tint"
            >
              Clear mark
            </button>
          )}
          <button
            type="button"
            onClick={onMark}
            className="rounded-full bg-accent px-4 py-2 text-[12.5px] font-semibold text-primary-foreground transition hover:brightness-110"
          >
            I finished here
          </button>
        </div>
      </div>
    </>
  );
}
