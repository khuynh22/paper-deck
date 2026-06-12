"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { label: "Feed", href: "/" },
  { label: "Library", href: "/library" },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-0.5 sm:flex">
      {ITEMS.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-tint ${
              active ? "font-semibold text-ink" : "font-normal text-muted-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
