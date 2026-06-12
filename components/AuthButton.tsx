"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/db/browser";

function initials(email: string): string {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  const chars =
    parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2) || "?";
  return chars.toUpperCase();
}

export function AuthButton({ email }: { email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!email) {
    return (
      <Link
        href="/login"
        className="flex h-[34px] items-center rounded-full border border-line px-4 text-[13.5px] font-medium text-ink transition-colors hover:border-accent hover:text-accent"
      >
        Sign in
      </Link>
    );
  }

  async function signOut() {
    setOpen(false);
    await browserClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={email}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold tracking-wide text-accent"
      >
        {initials(email)}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
            tabIndex={-1}
          />
          <div
            role="menu"
            className="pd-enter absolute right-0 top-11 z-50 min-w-52 rounded-xl border border-line bg-card p-1.5 shadow-[0_14px_36px_var(--shadow)]"
          >
            <div className="border-b border-hairline px-3 pb-2.5 pt-2 text-[12.5px] text-muted-foreground">
              {email}
            </div>
            <Link
              href="/library"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-[13.5px] text-ink hover:bg-tint"
            >
              Library
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="block w-full rounded-lg px-3 py-2 text-left text-[13.5px] text-ink hover:bg-tint"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
