"use client";

import { useEffect, useRef } from "react";

/**
 * A plain GET form that navigates to /search?q=… — the browser submits and the
 * server page renders results. Client JS only adds the `/` shortcut to focus the
 * field from anywhere (and Escape to leave it). The header hides it below `md`
 * via `className`; phones reach search through the bottom tab bar.
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
        className="h-[34px] w-full rounded-full border border-line bg-card px-3.5 pr-8 text-[13.5px] text-ink outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus-visible:ring-[3px] focus-visible:ring-accent-soft"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line bg-tint px-1.5 font-mono text-[10.5px] text-faint">
        /
      </kbd>
    </form>
  );
}
