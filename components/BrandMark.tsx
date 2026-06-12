/**
 * PaperDeck logo mark: two offset paper sheets in the brick-red accent, the
 * front one carrying highlighted text lines. Keep this in sync with
 * app/icon.svg (the favicon source of truth) — Next serves app/icon.svg at
 * /icon?<hash>, so it can't be referenced by a stable path; we inline the
 * same artwork here for in-app use. Colors follow the active theme via
 * CSS variables.
 */
export function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 27"
      className={className}
      role="img"
      aria-label="PaperDeck"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* The deck: a sheet stacked behind, peeking top-right */}
      <rect x="7" y="0" width="17" height="21" rx="3.5" fill="var(--accent)" opacity="0.28" />
      {/* The paper: front sheet */}
      <rect x="0" y="6" width="17" height="21" rx="3.5" fill="var(--accent)" />
      {/* Highlighted title line plus body text */}
      <rect x="4" y="11" width="9" height="2" rx="1" fill="rgba(255,255,255,0.95)" />
      <rect x="4" y="15.5" width="6" height="2" rx="1" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}
