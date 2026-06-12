/**
 * A plain GET form that navigates to /search?q=…. No client JS needed — the
 * browser submits and the server page renders results. The header hides it below
 * `md` via `className`; phones reach search through the bottom tab bar.
 */
export function SearchBar({
  defaultValue = "",
  className = "",
}: {
  defaultValue?: string;
  className?: string;
}) {
  return (
    <form action="/search" method="get" role="search" className={className}>
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search papers…"
        aria-label="Search papers"
        className="h-[34px] w-full rounded-full border border-line bg-card px-3.5 text-[13.5px] text-ink outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus-visible:ring-[3px] focus-visible:ring-accent-soft"
      />
    </form>
  );
}
