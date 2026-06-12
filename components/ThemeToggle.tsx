"use client";

/**
 * Light/dark toggle. The inline script in app/layout.tsx applies the stored
 * theme before paint; this button just flips the attribute and persists it.
 * It renders the same markup on server and client (no theme-dependent output),
 * so there is nothing to suppress.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    if (next === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    try {
      localStorage.setItem("pd-theme", next);
    } catch {
      // storage unavailable — the toggle still works for this page view
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Toggle theme"
      aria-label="Toggle light/dark theme"
      className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-tint hover:text-ink"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="8.2" />
        <path d="M12 3.8 a8.2 8.2 0 0 1 0 16.4 Z" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}
