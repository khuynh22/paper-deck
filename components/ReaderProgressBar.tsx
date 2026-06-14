"use client";

/** A thin accent bar pinned to the very top of the viewport, filled to `pct` (0–1). */
export function ReaderProgressBar({ pct }: { pct: number }) {
  const p = Math.round(Math.min(1, Math.max(0, pct)) * 100);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px]">
      <div
        className="h-full bg-accent transition-[width] duration-150 ease-linear"
        style={{ width: `${p}%` }}
      />
    </div>
  );
}
