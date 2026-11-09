"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProgressSave } from "@/components/useProgressSave";
import { resolveResumeTarget } from "@/lib/reader/anchor";
import { readDepthFraction, readBoundaryFraction, isComplete } from "@/lib/reader/readDepth";
import { readerViewportTop, scrollTopForElement } from "@/lib/reader/viewport";
import { ReaderBar } from "@/components/ReaderBar";
import { HighlightLayer } from "@/components/HighlightLayer";
import type { ProgressRow, Highlight } from "@/lib/types";
import type { ProgressUpdate } from "@/lib/db/progressRow";

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
  const [acknowledgedMarkPct, setAcknowledgedMarkPct] = useState(clamp01(initialProgress?.markedPct ?? 0));
  // Current scroll position (viewport top) — drives the ReaderBar progress chrome.
  const [progressPct, setProgressPct] = useState(clamp01(initialProgress?.scrollPct ?? 0));
  const onAcknowledged = useCallback((update: ProgressUpdate) => {
    if (update.markedPct !== undefined) setAcknowledgedMarkPct(clamp01(update.markedPct));
  }, []);
  const { state: saveState, explicitUnsaved, enqueue, retry } = useProgressSave(paperId, onAcknowledged);
  // Viewport-bottom read depth remains separate from the saved scroll position.
  const readPctRef = useRef(clamp01(initialProgress?.readPct ?? 0));
  const scrollAnchorRef = useRef<string | null>(initialProgress?.blockAnchor ?? null);
  const lastAnchorMeasureRef = useRef(-Infinity);
  const trailingAnchorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const top = readerViewportTop() + 2;
    let current: string | null = null;
    for (const node of nodes) {
      if (node.getBoundingClientRect().top <= top) {
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
      enqueue({
        scrollPct: currentScrollPct(),
        blockAnchor: topBlock(),
        readPct: readPctRef.current,
        readerKind: "html",
        ...extra,
      }, true);
    },
    [enqueue, currentScrollPct, topBlock],
  );

  // Resume to the saved position once the HTML mounts.
  useEffect(() => {
    if (!initialProgress) return;
    const content = containerRef.current;
    if (!content) return;
    const readerPath = window.location.pathname;
    const target = resolveResumeTarget(
      { blockAnchor: initialProgress.blockAnchor, scrollPct: initialProgress.scrollPct },
      orderedAnchors(),
    );
    let active = true;
    let frame: number | null = null;
    const resume = () => {
      if (!active || window.location.pathname !== readerPath || !content.isConnected) return;
      if (target.type === "anchor") {
        const node = content.querySelector<HTMLElement>(
          `[data-blk="${target.value}"]`,
        );
        if (node) window.scrollTo({ top: scrollTopForElement(node) });
      } else {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: target.value * Math.max(0, max) });
      }
    };
    const schedule = () => {
      if (!active) return;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = null; resume(); });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(content);
    const stop = () => {
      if (!active) return;
      active = false;
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      clearTimeout(timeout);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
    };
    // Fonts and figures may change the article height after mount. Keep the
    // saved anchor aligned until the reader starts interacting or layout settles.
    const timeout = setTimeout(stop, 10000);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("pointerdown", stop);
    window.addEventListener("keydown", stop);
    schedule();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track scroll position and read depth, then debounce saves.
  useEffect(() => {
    const readerPath = window.location.pathname;
    const isCurrentReader = () => window.location.pathname === readerPath && Boolean(containerRef.current?.isConnected);
    function onScroll() {
      if (!isCurrentReader()) return;
      const pct = currentScrollPct();
      setProgressPct(pct);
      readPctRef.current = readDepthFraction(
        window.scrollY,
        window.innerHeight,
        document.documentElement.scrollHeight,
      );
      // Real browsers emit scroll about once per frame, so limit expensive
      // block geometry by elapsed time rather than requestAnimationFrame.
      const now = Date.now();
      if (now - lastAnchorMeasureRef.current >= 250) {
        if (trailingAnchorRef.current !== null) clearTimeout(trailingAnchorRef.current);
        trailingAnchorRef.current = null;
        scrollAnchorRef.current = topBlock();
        lastAnchorMeasureRef.current = now;
      } else if (trailingAnchorRef.current === null) {
        trailingAnchorRef.current = setTimeout(() => {
          trailingAnchorRef.current = null;
          if (!isCurrentReader()) return;
          scrollAnchorRef.current = topBlock();
          lastAnchorMeasureRef.current = Date.now();
          enqueue({ scrollPct: currentScrollPct(), blockAnchor: scrollAnchorRef.current,
            readPct: readPctRef.current, readerKind: "html" }, false);
        }, 250 - (now - lastAnchorMeasureRef.current));
      }
      // A stale anchor must not override the up-to-date scroll percentage if
      // navigation flushes before the trailing measurement fires.
      enqueue({ scrollPct: pct, blockAnchor: trailingAnchorRef.current === null ? scrollAnchorRef.current : null,
        readPct: readPctRef.current, readerKind: "html" }, false);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (trailingAnchorRef.current !== null) clearTimeout(trailingAnchorRef.current);
    };
  }, [currentScrollPct, enqueue, topBlock]);

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
  }

  function onClear() {
    setMarkedPct(0);
    persist({ markedPct: 0, status: "reading" });
  }

  const content = useMemo(() => ({ __html: html }), [html]);
  const markPending = markedPct > 0 && explicitUnsaved;
  const clearPending = markedPct === 0 && explicitUnsaved && acknowledgedMarkPct > 0;
  const displayMarkedPct = clearPending ? acknowledgedMarkPct : markedPct;

  return (
    <>
      <div className="relative">
        {/* Read mark: pale-yellow band behind the text, from the top down to the
            button-set boundary. Constrained to the 52rem column (matching
            .paper-html) so it lands on the paper, not the side margins. */}
        {displayMarkedPct > 0 && (
          <div
            data-testid="read-mark"
            data-save-state={clearPending ? "pending-clear" : markPending ? "unsaved" : "saved"}
            aria-hidden
            className={`pointer-events-none absolute left-1/2 top-0 z-0 w-full max-w-[52rem] -translate-x-1/2 bg-[var(--read-tint)] transition-[height] duration-150 ease-linear ${explicitUnsaved ? "opacity-50 outline-2 outline-dashed outline-[var(--read-accent)]" : ""}`}
            style={{ height: `${clamp01(displayMarkedPct) * 100}%` }}
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
        markPending={markPending}
        clearPending={clearPending}
        onMark={onMark}
        onClear={onClear}
        progressPct={progressPct}
        saveState={saveState}
        onRetry={retry}
      />
    </>
  );
}
