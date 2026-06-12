"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  {
    label: "Feed",
    href: "/",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        <path d="M9 3.5h9a2 2 0 0 1 2 2V16" />
      </svg>
    ),
  },
  {
    label: "Search",
    href: "/search",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="16.8" y1="16.8" x2="21" y2="21" />
      </svg>
    ),
  },
  {
    label: "Library",
    href: "/library",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3.5h12V21l-6-4-6 4z" />
      </svg>
    ),
  },
];

/** Phone-only tab bar. The reader supplies its own chrome, so hide it there. */
export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/reader/")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-3 border-t border-line bg-background/90 px-2 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md sm:hidden">
      {ITEMS.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-[3px] pb-1 pt-1.5 text-[10.5px] tracking-wide ${
              active ? "font-semibold text-accent" : "font-normal text-muted-foreground"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
