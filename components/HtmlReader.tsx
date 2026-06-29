"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveProgress } from "@/app/actions/progress";
import { resolveResumeTarget } from "@/lib/reader/anchor";
import { readDepthFraction, readBoundaryFraction, isComplete } from "@/lib/reader/readDepth";
import { ReaderBar } from "@/components/ReaderBar";
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
  // Marked read boundary (0–1 of content height); 0 = unmarked. Set ONLY by the
  // "I finished here" / "Clear mark" buttons — sticky across scrolling and reloads.
  const [markedPct, setMarkedPct] = useState(clamp01(initialProgress?.markedPct ?? 0));
  // Current scroll position (viewport top) — drives the ReaderBar progress chrome.
  const [progressPct, setProgressPct] = useState(clamp01(initialProgress?.scrollPct ?? 0));
  const [hint, setHint] = useState<string | null>(null);
  // Viewport-bottom fraction, written on scroll so the shelf "% read" is unchanged.
  const readPctRef = useRef(clamp01(initialProgress?.readPct ?? 0));
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

  /** Persist resume position; the buttons pass markedPct/status via `extra`. */
  const persist = useCallback(
    (extra: Partial<{ markedPct: number; status: "reading" | "done" }> = {}) => {
      saveProgress(paperId, {
        scrollPct: currentScrollPct(),
        blockAnchor: topBlock(),
        readPct: readPctRef.current,
        readerKind: "html",
        ...extra,
      }).catch(() => {});
    },
    [paperId, currentScrollPct, topBlock],
  );

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

  // Track scroll position (resume + the shelf's read_pct) and debounce saves.
  useEffect(() => {
    function onScroll() {
      setProgressPct(currentScrollPct());
      readPctRef.current = readDepthFraction(
        window.scrollY,
        window.innerHeight,
        document.documentElement.scrollHeight,
      );
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(), 600);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [currentScrollPct, persist]);

  function onMark() {
    const el = containerRef.current;
    if (!el) return;
    const frac = readBoundaryFraction(
      window.innerHeight,
      el.getBoundingClientRect().top,
      el.offsetHeight,
    );
    setMarkedPct(frac);
    persist({ markedPct: frac, status: isComplete(frac) ? "done" : "reading" });
    setHint("Marked ✓");
    setTimeout(() => setHint(null), 1500);
  }

  function onClear() {
    setMarkedPct(0);
    persist({ markedPct: 0, status: "reading" });
  }

  const content = useMemo(() => ({ __html: html }), [html]);

  return (
    <>
      <div className="relative">
        {/* Read mark: pale-yellow band behind the text, from the top down to the
            button-set boundary. Constrained to the 52rem column (matching
            .paper-html) so it lands on the paper, not the side margins. */}
        {markedPct > 0 && (
          <div
            data-testid="read-mark"
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 z-0 w-full max-w-[52rem] -translate-x-1/2 bg-[var(--read-tint)] transition-[height] duration-150 ease-linear"
            style={{ height: `${clamp01(markedPct) * 100}%` }}
          />
        )}
        <div
          ref={containerRef}
          className="paper-html relative z-10 px-4 pb-28 pt-6"
          dangerouslySetInnerHTML={content}
        />
        <HighlightLayer
          paperId={paperId}
          containerRef={containerRef}
          initialHighlights={initialHighlights}
        />
      </div>
      <ReaderBar
        marked={markedPct > 0}
        onMark={onMark}
        onClear={onClear}
        progressPct={progressPct}
        hint={hint}
      />
    </>
  );
}
