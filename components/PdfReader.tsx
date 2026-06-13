"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { saveProgress } from "@/app/actions/progress";
import { ReaderBar } from "@/components/ReaderBar";
import type { ProgressRow } from "@/lib/types";

// Load the pdf.js worker from a CDN, pinned to the exact version react-pdf ships
// (worker and API versions must match). Avoids bundler worker-resolution issues.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const HEADER_OFFSET = 72;

export function PdfReader({
  paperId,
  initialProgress,
}: {
  paperId: string;
  initialProgress: ProgressRow | null;
}) {
  const fileUrl = `/api/reader/${paperId}?pdf=1`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(800);
  const [marked, setMarked] = useState<number | null>(
    initialProgress?.markedAnchor ? Number(initialProgress.markedAnchor) : null,
  );
  const [progressPct, setProgressPct] = useState(initialProgress?.scrollPct ?? 0);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function measure() {
      const w = containerRef.current?.clientWidth ?? 800;
      setWidth(Math.min(w - 16, 820));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const currentPage = useCallback((): number => {
    const el = containerRef.current;
    if (!el) return 1;
    const pages = Array.from(el.querySelectorAll<HTMLElement>("[data-page]"));
    let current = 1;
    for (const p of pages) {
      if (p.getBoundingClientRect().top - HEADER_OFFSET <= 1) current = Number(p.dataset.page);
      else break;
    }
    return current;
  }, []);

  const currentScrollPct = useCallback((): number => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }, []);

  const persist = useCallback(
    (extra: Partial<{ markedAnchor: string | null; status: "reading" | "done" }> = {}) => {
      const pct = currentScrollPct();
      setProgressPct(pct);
      saveProgress(paperId, {
        scrollPct: pct,
        blockAnchor: String(currentPage()),
        readerKind: "pdf",
        ...extra,
      }).catch(() => {});
    },
    [paperId, currentPage, currentScrollPct],
  );

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

  function onDocumentLoad({ numPages: n }: { numPages: number }) {
    setNumPages(n);
    // Resume to the saved page once pages exist.
    const resumePage = initialProgress?.blockAnchor ? Number(initialProgress.blockAnchor) : null;
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = resumePage
          ? containerRef.current?.querySelector<HTMLElement>(`[data-page="${resumePage}"]`)
          : null;
        if (el) {
          window.scrollTo({ top: el.offsetTop - HEADER_OFFSET });
        } else if (initialProgress?.scrollPct) {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo({ top: initialProgress.scrollPct * Math.max(0, max) });
        }
      }, 300);
    });
  }

  function onMark() {
    const page = currentPage();
    setMarked(page);
    const done = numPages > 0 && page >= numPages;
    persist({ markedAnchor: String(page), status: done ? "done" : "reading" });
    setHint("Marked ✓");
    setTimeout(() => setHint(null), 1500);
  }

  function onClear() {
    setMarked(null);
    // Clearing the finished-marker means the paper is in progress again, not done.
    persist({ markedAnchor: null, status: "reading" });
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center text-sm text-muted-foreground">
        Couldn’t load the PDF in-app.{" "}
        <a className="text-primary underline" href={fileUrl} target="_blank" rel="noreferrer">
          Open it directly
        </a>
        .
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="mx-auto flex max-w-3xl flex-col items-center px-2 pb-28 pt-6">
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoad}
          onLoadError={() => setError(true)}
          loading={<p className="py-20 text-sm text-muted-foreground">Loading PDF…</p>}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
            const isRead = marked !== null && n <= marked;
            return (
              <div
                key={n}
                data-page={n}
                className={`relative mb-4 rounded-lg border ${
                  isRead ? "border-l-[3px] border-l-[var(--read-accent)] bg-[var(--read-tint)]" : "border-border"
                }`}
              >
                {isRead && (
                  <span className="absolute right-2 top-2 z-10 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    read
                  </span>
                )}
                <Page
                  pageNumber={n}
                  width={width}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </div>
            );
          })}
        </Document>
      </div>
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
