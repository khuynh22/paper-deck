"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveProgress } from "@/app/actions/progress";
import { resolveResumeTarget, blocksUpTo, isLastBlock } from "@/lib/reader/anchor";
import { ReaderBar } from "@/components/ReaderBar";
import type { ProgressRow } from "@/lib/types";

const HEADER_OFFSET = 72; // sticky header height-ish

export function HtmlReader({
  paperId,
  html,
  initialProgress,
}: {
  paperId: string;
  html: string;
  initialProgress: ProgressRow | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [marked, setMarked] = useState<string | null>(initialProgress?.markedAnchor ?? null);
  const [progressPct, setProgressPct] = useState(initialProgress?.scrollPct ?? 0);
  const [hint, setHint] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Leaf content blocks only — a [data-blk] with no nested [data-blk]. arXiv
   * wraps whole sections in <section data-blk>, so treating those containers as
   * anchors would bleed the "read" tint across subsections the reader hasn't
   * reached. Marking, highlighting, and resume all operate on leaves.
   */
  const leafBlocks = useCallback((): HTMLElement[] => {
    const el = containerRef.current;
    if (!el) return [];
    return Array.from(el.querySelectorAll<HTMLElement>("[data-blk]")).filter(
      (n) => !n.querySelector("[data-blk]"),
    );
  }, []);

  const orderedAnchors = useCallback(
    (): string[] => leafBlocks().map((n) => n.dataset.blk as string),
    [leafBlocks],
  );

  const applyHighlight = useCallback(
    (markAnchor: string | null) => {
      const leaves = leafBlocks();
      const read = new Set(
        blocksUpTo(
          markAnchor,
          leaves.map((n) => n.dataset.blk as string),
        ),
      );
      leaves.forEach((node) => {
        node.classList.toggle("read", read.has(node.dataset.blk as string));
      });
    },
    [leafBlocks],
  );

  /** The data-blk of the leaf block currently at the top of the viewport. */
  const topBlock = useCallback((): string | null => {
    const nodes = leafBlocks();
    let current: string | null = null;
    for (const node of nodes) {
      if (node.getBoundingClientRect().top - HEADER_OFFSET <= 1) {
        current = node.dataset.blk as string;
      } else break;
    }
    return current ?? nodes[0]?.dataset.blk ?? null;
  }, [leafBlocks]);

  const currentScrollPct = useCallback((): number => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }, []);

  const persist = useCallback(
    (extra: Partial<{ markedAnchor: string | null; status: "reading" | "done" }> = {}) => {
      const pct = currentScrollPct();
      const block = topBlock();
      setProgressPct(pct);
      saveProgress(paperId, {
        scrollPct: pct,
        blockAnchor: block,
        readerKind: "html",
        ...extra,
      }).catch(() => {});
    },
    [paperId, currentScrollPct, topBlock],
  );

  // Resume + initial highlight after the HTML mounts.
  useEffect(() => {
    const anchors = orderedAnchors();
    applyHighlight(initialProgress?.markedAnchor ?? null);

    if (initialProgress) {
      const target = resolveResumeTarget(
        { blockAnchor: initialProgress.blockAnchor, scrollPct: initialProgress.scrollPct },
        anchors,
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced scroll persistence.
  useEffect(() => {
    function onScroll() {
      setProgressPct(currentScrollPct());
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
    const block = topBlock();
    setMarked(block);
    applyHighlight(block);
    const done = isLastBlock(block, orderedAnchors());
    persist({ markedAnchor: block, status: done ? "done" : "reading" });
    setHint("Marked ✓");
    setTimeout(() => setHint(null), 1500);
  }

  function onClear() {
    setMarked(null);
    applyHighlight(null);
    // Clearing the finished-marker means the paper is in progress again, not done.
    persist({ markedAnchor: null, status: "reading" });
  }

  const content = useMemo(() => ({ __html: html }), [html]);

  return (
    <>
      <div
        ref={containerRef}
        className="paper-html px-4 pb-28 pt-6"
        dangerouslySetInnerHTML={content}
      />
      <ReaderBar
        marked={marked !== null}
        onMark={onMark}
        onClear={onClear}
        progressPct={progressPct}
        hint={hint}
      />
    </>
  );
}
