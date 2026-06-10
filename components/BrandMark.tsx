/**
 * PaperDeck logo mark: a highlighted "paper" sheet stacked into a "deck".
 * Keep this in sync with app/icon.svg (the favicon source of truth) — Next
 * serves app/icon.svg at /icon?<hash>, so it can't be referenced by a stable
 * path; we inline the same artwork here for in-app use.
 */
export function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="PaperDeck"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="paperdeck-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b54ea" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="url(#paperdeck-bg)" />
      {/* The deck: a sheet stacked behind, peeking top-right */}
      <rect x="11" y="6" width="14" height="18" rx="2.5" fill="#818cf8" />
      {/* The paper: front sheet */}
      <rect x="7" y="8" width="14" height="18" rx="2.5" fill="#ffffff" />
      {/* Highlighted title line (brand accent) plus body text */}
      <rect x="10" y="12" width="8" height="1.8" rx="0.9" fill="#f59e0b" />
      <rect x="10" y="15.4" width="8" height="1.4" rx="0.7" fill="#818cf8" />
      <rect x="10" y="18" width="8" height="1.4" rx="0.7" fill="#818cf8" />
      <rect x="10" y="20.6" width="5" height="1.4" rx="0.7" fill="#818cf8" />
    </svg>
  );
}
