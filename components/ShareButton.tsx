"use client";

import { useEffect, useRef, useState } from "react";

function ShareIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

/**
 * Share the canonical paper link: the native share sheet where available
 * (mobile), otherwise copy-to-clipboard with a transient "Copied" state. `path`
 * is the canonical route (e.g. /paper/abc); the origin is read at click time so
 * the shared URL is always absolute and free of any query/hash on the page.
 */
export function ShareButton({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function onClick() {
    const url = `${window.location.origin}${path}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch (err) {
        // The user dismissing the share sheet throws AbortError — not an error.
        if ((err as Error)?.name !== "AbortError") {
          // fall back to copy on a real failure
          await copy(url);
        }
      }
      return;
    }
    await copy(url);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked (e.g. insecure context) — nothing graceful to do
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Share link"
      title="Share"
      className="flex h-[42px] items-center gap-2 rounded-full border border-line px-4.5 text-[13.5px] font-medium text-ink transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <ShareIcon size={14} />
      {copied ? "Copied" : "Share"}
    </button>
  );
}
