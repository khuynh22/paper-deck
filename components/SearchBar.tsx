/**
 * A plain GET form that navigates to /search?q=…. No client JS needed — the
 * browser submits and the server page renders results. The header hides it below
 * `sm` via `className`; the results page renders a full-width, prefilled copy.
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
        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
      />
    </form>
  );
}
