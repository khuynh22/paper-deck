"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveProgress } from "@/app/actions/progress";
import { resolveResumeTarget } from "@/lib/reader/anchor";
import { readDepthFraction, isComplete } from "@/lib/reader/readDepth";
import { ReaderProgressBar } from "@/components/ReaderProgressBar";
import { HighlightLayer } from "@/components/HighlightLayer";
import type { ProgressRow, Highlight } from "@/lib/types";

const HEADER_OFFSET = 72; // sticky header height-ish

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function HtmlReader({
  paperId,
  html,
  initialProgress,
  initialHighlights = [],
}: {
  paperId: string;
  html: string;
  initialProgress: ProgressRow | null;
  initialHighlights?: Highlight[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Read depth = current scroll fraction (viewport bottom). Reversible: scrolling up lowers it.
  const [readPct, setReadPct] = useState(clamp01(initialProgress?.readPct ?? 0));
  const readPctRef = useRef(readPct);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** All block anchors, for validating the saved resume target. */
  const orderedAnchors = useCallback((): string[] => {
    const el = containerRef.current;
    if (!el) return [];
    return Array.from(el.querySelectorAll<HTMLElement>("[data-blk]")).map(
      (n) => n.dataset.blk as string,
    );
  }, []);

  /** The data-blk at the top of the viewport — saved as the resume anchor. */
  const topBlock = useCallback((): string | null => {
    const el = containerRef.current;
    if (!el) return null;
    const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-blk]"));
    let current: string | null = null;
    for (const node of nodes) {
      if (node.getBoundingClientRect().top - HEADER_OFFSET <= 1) {
        current = node.dataset.blk as string;
      } else break;
    }
    return current ?? nodes[0]?.dataset.blk ?? null;
  }, []);

  const currentScrollPct = useCallback((): number => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? clamp01(window.scrollY / max) : 0;
  }, []);

  /** Persist resume position + the running read-depth max (debounced by caller). */
  const persist = useCallback(() => {
    const depth = readPctRef.current;
    saveProgress(paperId, {
      scrollPct: currentScrollPct(),
      blockAnchor: topBlock(),
      readPct: depth,
      readerKind: "html",
      status: isComplete(depth) ? "done" : "reading",
    }).catch(() => {});
  }, [paperId, currentScrollPct, topBlock]);

  // Resume to the saved position once the HTML mounts.
  useEffect(() => {
    if (!initialProgress) return;
    const target = resolveResumeTarget(
      { blockAnchor: initialProgress.blockAnchor, scrollPct: initialProgress.scrollPct },
      orderedAnchors(),
    );
    requestAnimationFrame(() => {
      if (target.type === "anchor") {
        const node = containerRef.current?.querySelector<HTMLElement>(
          `[data-blk="${target.value}"]`,
        );
        if (node) window.scrollTo({ top: node.offsetTop - HEADER_OFFSET });
      } else {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: target.value * Math.max(0, max) });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track the current read depth (reversible) + debounce persistence.
  useEffect(() => {
    function onScroll() {
      const frac = readDepthFraction(
        window.scrollY,
        window.innerHeight,
        document.documentElement.scrollHeight,
      );
      readPctRef.current = frac;
      setReadPct(frac);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(), 600);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [persist]);

  const content = useMemo(() => ({ __html: html }), [html]);

  return (
    <>
      <div className="relative">
        {/* Read rail: amber bar in the left gutter, filled to the current read depth. */}
        <div
          data-testid="read-rail"
          aria-hidden
          className="pointer-events-none absolute left-1 top-0 w-[3px] rounded-full bg-[var(--read-accent)] transition-[height] duration-150 ease-linear"
          style={{ height: `${clamp01(readPct) * 100}%` }}
        />
        <div
          ref={containerRef}
          className="paper-html px-4 pb-28 pt-6"
          dangerouslySetInnerHTML={content}
        />
        <HighlightLayer
          paperId={paperId}
          containerRef={containerRef}
          initialHighlights={initialHighlights}
        />
      </div>
      <ReaderProgressBar pct={readPct} />
    </>
  );
}
