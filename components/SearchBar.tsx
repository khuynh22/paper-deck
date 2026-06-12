"use client";

import { useEffect, useRef } from "react";

/**
 * A plain GET form that navigates to /search?q=… — the browser submits and the
 * server page renders results. Client JS only adds the `/` shortcut to focus the
 * field from anywhere (and Escape to leave it). The header hides it below `sm`
 * via `className`; the results page renders a full-width, prefilled copy.
 */
export function SearchBar({
  defaultValue = "",
  className = "",
}: {
  defaultValue?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <form action="/search" method="get" role="search" className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search papers…"
        aria-label="Search papers"
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
        }}
        className="h-9 w-full rounded-md border border-border bg-background px-3 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 text-xs text-muted-foreground">
        /
      </kbd>
    </form>
  );
}
