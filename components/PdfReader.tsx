"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { useProgressSave } from "@/components/useProgressSave";
import { ReaderBar } from "@/components/ReaderBar";
import { boundedPage, pageWindow, pdfTextMarkup } from "@/lib/reader/pdf";
import { PdfPageFrame } from "@/components/PdfPageAnnotations";
import { HighlightFallback } from "@/components/HighlightFallback";
import type { Highlight, ProgressRow } from "@/lib/types";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
type PdfDocument = Parameters<
  NonNullable<ComponentProps<typeof Document>["onLoadSuccess"]>
>[0];

const PDF_OPTIONS = { isEvalSupported: false };
export function PdfReader({
  paperId,
  initialProgress,
  initialHighlights = [],
  requestedHighlightId,
}: {
  paperId: string;
  initialProgress: ProgressRow | null;
  initialHighlights?: Highlight[];
  requestedHighlightId?: string;
}) {
  const fileUrl = `/api/reader/${paperId}?pdf=1`,
    containerRef = useRef<HTMLDivElement>(null),
    toolbarRef = useRef<HTMLDivElement>(null),
    pdfRef = useRef<PdfDocument | null>(null),
    generation = useRef(0),
    pageCount = useRef(0),
    requestedPage = useRef(1);
  const [highlights, setHighlights] = useState(initialHighlights),
    [fingerprint, setFingerprint] = useState(""),
    [lockedPage, setLockedPage] = useState<number | null>(null),
    [missingTarget, setMissingTarget] = useState(false);
  const onHighlightChange = useCallback(
    (highlight: Highlight | null, id: string) =>
      setHighlights((rows) =>
        highlight
          ? [...rows.filter((h) => h.id !== id), highlight]
          : rows.filter((h) => h.id !== id),
      ),
    [],
  );
  const onTargetMissing = useCallback(() => setMissingTarget(true), []);
  const onTextFailure = useCallback(() => {
    if (requestedHighlightId) onTargetMissing();
  }, [requestedHighlightId, onTargetMissing]);
  const [ratios, setRatios] = useState<number[]>([]),
    [width, setWidth] = useState(700),
    [zoom, setZoom] = useState(1),
    [active, setActive] = useState(1),
    [pageInput, setPageInput] = useState("1"),
    [error, setError] = useState(false);
  const [marked, setMarked] = useState<number | null>(
      initialProgress?.markedAnchor
        ? Number(initialProgress.markedAnchor)
        : null,
    ),
    [progressPct, setProgressPct] = useState(initialProgress?.scrollPct ?? 0);
  const [query, setQuery] = useState(""),
    [searchTerm, setSearchTerm] = useState(""),
    [matches, setMatches] = useState<number[]>([]),
    [matchIndex, setMatchIndex] = useState(0),
    [searchStatus, setSearchStatus] = useState(""),
    [searching, setSearching] = useState(false),
    [emptyPages, setEmptyPages] = useState<Set<number>>(new Set());
  const searchGeneration = useRef(0),
    textCache = useRef(new Map<number, string>()),
    resumed = useRef(false),
    measuredWidth = useRef(700),
    resizePosition = useRef<{ page: number; fraction: number } | null>(null);
  const { state: saveState, enqueue, retry } = useProgressSave(paperId);
  const numPages = ratios.length,
    pageWidth = Math.max(100, width * zoom),
    windowPages = pageWindow(active, numPages);
  const renderText = useCallback(
    ({ str }: { str: string }) => pdfTextMarkup(str, searchTerm),
    [searchTerm],
  );
  const headerOffset = useCallback(
    () => Math.max(112, 106 + (toolbarRef.current?.offsetHeight ?? 46)),
    [],
  );
  const currentPage = useCallback(() => {
    let current = 1;
    for (const node of containerRef.current?.querySelectorAll<HTMLElement>(
      "[data-page]",
    ) ?? []) {
      if (node.getBoundingClientRect().top <= headerOffset() + 1)
        current = Number(node.dataset.page);
      else break;
    }
    return current;
  }, [headerOffset]);
  const currentScrollPct = useCallback(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }, []);
  const persist = useCallback(
    (
      extra: Partial<{
        markedAnchor: string | null;
        status: "reading" | "done";
      }> = {},
      immediate = true,
    ) => {
      const pct = currentScrollPct();
      setProgressPct(pct);
      enqueue(
        {
          scrollPct: pct,
          blockAnchor: String(currentPage()),
          readerKind: "pdf",
          ...extra,
        },
        immediate,
      );
    },
    [enqueue, currentPage, currentScrollPct],
  );
  const goToPage = useCallback(
    (value: number) => {
      const page = boundedPage(value, pageCount.current),
        node = containerRef.current?.querySelector<HTMLElement>(
          `[data-page="${page}"]`,
        );
      setActive(page);
      setPageInput(String(page));
      if (node) {
        window.scrollTo({
          top:
            node.getBoundingClientRect().top + window.scrollY - headerOffset(),
        });
        node.focus({ preventScroll: true });
      }
    },
    [headerOffset],
  );
  const capturePosition = useCallback(() => {
    const page = currentPage(),
      node = containerRef.current?.querySelector<HTMLElement>(
        `[data-page="${page}"]`,
      );
    if (node)
      resizePosition.current = {
        page,
        fraction:
          (headerOffset() - node.getBoundingClientRect().top) /
          Math.max(1, node.offsetHeight),
      };
  }, [currentPage, headerOffset]);
  useEffect(() => {
    const measure = () => {
      const next = Math.min(
        820,
        Math.max(100, (containerRef.current?.clientWidth ?? 716) - 16),
      );
      if (next === measuredWidth.current) return;
      capturePosition();
      measuredWidth.current = next;
      setWidth(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [capturePosition]);
  useLayoutEffect(() => {
    if (!numPages) return;
    if (!resumed.current) {
      resumed.current = true;
      const page = boundedPage(
        requestedHighlightId
          ? requestedPage.current
          : Number(initialProgress?.blockAnchor) || 1,
        numPages,
      );
      const node = containerRef.current?.querySelector<HTMLElement>(
        `[data-page="${page}"]`,
      );
      if (
        !requestedHighlightId &&
        !initialProgress?.blockAnchor &&
        initialProgress?.scrollPct
      ) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({
          top:
            Math.min(1, Math.max(0, initialProgress.scrollPct)) *
            Math.max(0, max),
        });
      } else if (node)
        window.scrollTo({
          top:
            node.getBoundingClientRect().top + window.scrollY - headerOffset(),
        });
    } else if (resizePosition.current) {
      const { page, fraction } = resizePosition.current,
        node = containerRef.current?.querySelector<HTMLElement>(
          `[data-page="${page}"]`,
        );
      if (node)
        window.scrollTo({
          top:
            node.getBoundingClientRect().top +
            window.scrollY -
            headerOffset() +
            node.offsetHeight * fraction,
        });
    }
    resizePosition.current = null;
  }, [
    numPages,
    pageWidth,
    initialProgress,
    headerOffset,
    requestedHighlightId,
  ]);
  useEffect(() => {
    const onScroll = () => {
      const page = currentPage();
      setActive(page);
      setPageInput(String(page));
      persist({}, false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [currentPage, persist]);
  useEffect(
    () => () => {
      generation.current++;
      searchGeneration.current++;
    },
    [],
  );
  async function onDocumentLoad(pdf: PdfDocument) {
    pdfRef.current = pdf;
    pageCount.current = pdf.numPages;
    const identity = pdf.fingerprints[0] ?? "";
    setFingerprint(identity);
    if (requestedHighlightId) {
      const target = highlights.find((h) => h.id === requestedHighlightId),
        anchor = target?.pdfAnchor;
      const valid = Boolean(
        anchor &&
        anchor.fingerprint === identity &&
        anchor.page <= pdf.numPages,
      );
      requestedPage.current = valid ? anchor!.page : 1;
      setMissingTarget(!valid);
    }
    const token = ++generation.current;
    try {
      const sizes: number[] = [];
      for (let page = 1; page <= pdf.numPages; page++) {
        const item = await pdf.getPage(page);
        if (token !== generation.current) return;
        const viewport = item.getViewport({ scale: 1 });
        sizes.push(viewport.height / viewport.width);
      }
      setRatios(sizes);
      const resume = boundedPage(
        requestedHighlightId
          ? requestedPage.current
          : Number(initialProgress?.blockAnchor) || 1,
        pdf.numPages,
      );
      setActive(resume);
      setPageInput(String(resume));
    } catch {
      if (token === generation.current) setError(true);
    }
  }
  async function search() {
    const pdf = pdfRef.current,
      term = query.trim();
    if (!pdf) return;
    const token = ++searchGeneration.current;
    setSearchTerm(term);
    setMatches([]);
    setMatchIndex(0);
    if (!term) {
      setSearchStatus("Enter text to search this document.");
      setSearching(false);
      return;
    }
    setSearching(true);
    let textPages = 0;
    const found: number[] = [];
    try {
      for (let page = 1; page <= pdf.numPages; page++) {
        let text = textCache.current.get(page);
        if (text === undefined) {
          const item = await pdf.getPage(page),
            content = await item.getTextContent();
          text = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ");
          textCache.current.set(page, text);
        }
        if (token !== searchGeneration.current) return;
        if (text.trim()) textPages++;
        if (text.toLowerCase().includes(term.toLowerCase())) found.push(page);
        setSearchStatus(`Searching page ${page} of ${pdf.numPages}...`);
      }
      setMatches(found);
      setSearchStatus(
        !textPages
          ? "This PDF has no selectable text. Scanned or image-only PDFs require OCR, which is not available here."
          : found.length
            ? `${found.length} matching ${found.length === 1 ? "page" : "pages"}`
            : "No matching text found.",
      );
      if (found.length) requestAnimationFrame(() => goToPage(found[0]));
    } catch {
      if (token === searchGeneration.current)
        setSearchStatus(
          "Search could not read the complete PDF. Please retry.",
        );
    } finally {
      if (token === searchGeneration.current) setSearching(false);
    }
  }
  function changeMatch(delta: number) {
    const index = (matchIndex + delta + matches.length) % matches.length;
    setMatchIndex(index);
    goToPage(matches[index]);
  }
  function onMark() {
    const page = currentPage();
    setMarked(page);
    persist({
      markedAnchor: String(page),
      status: numPages > 0 && page >= numPages ? "done" : "reading",
    });
  }
  function onClear() {
    setMarked(null);
    persist({ markedAnchor: null, status: "reading" });
  }
  if (error)
    return (
      <div role="alert" className="mx-auto max-w-md px-4 py-20 text-sm">
        {requestedHighlightId && (
          <HighlightFallback
            highlight={highlights.find((h) => h.id === requestedHighlightId)}
          />
        )}
        Couldn&apos;t load the PDF in-app.{" "}
        <a
          className="text-accent underline"
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open it directly
        </a>
        .
      </div>
    );
  return (
    <>
      {missingTarget && (
        <HighlightFallback
          floating
          highlight={highlights.find((h) => h.id === requestedHighlightId)}
        />
      )}
      <div
        ref={toolbarRef}
        aria-label="PDF controls"
        className="sticky top-[98px] z-20 flex flex-wrap gap-3 border-b border-line bg-background p-3 text-sm"
      >
        <button
          disabled={!numPages || active <= 1}
          onClick={() => goToPage(active - 1)}
          aria-label="Previous PDF page"
        >
          Previous
        </button>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            goToPage(Number(pageInput));
          }}
        >
          <label>
            Page{" "}
            <input
              aria-label="PDF page number"
              type="number"
              min={1}
              max={numPages || 1}
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              className="w-16 rounded border border-line bg-card px-2"
            />
          </label>
          <span>of {numPages || "..."}</span>
          <button disabled={!numPages}>Go</button>
        </form>
        <button
          disabled={!numPages || active >= numPages}
          onClick={() => goToPage(active + 1)}
          aria-label="Next PDF page"
        >
          Next
        </button>
        <label>
          Zoom{" "}
          <select
            value={zoom}
            onChange={(event) => {
              capturePosition();
              setZoom(Number(event.target.value));
            }}
            className="rounded border border-line bg-card"
          >
            {[0.5, 0.75, 1, 1.25, 1.5].map((value) => (
              <option key={value} value={value}>
                {value * 100}%
              </option>
            ))}
          </select>
        </label>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <input
            aria-label="Search PDF"
            maxLength={200}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 w-36 rounded border border-line bg-card px-2"
          />
          <button disabled={!numPages || searching}>Search PDF</button>
        </form>
        {matches.length > 0 && (
          <>
            <button
              aria-label="Previous search result"
              onClick={() => changeMatch(-1)}
            >
              Previous match
            </button>
            <span>
              {matchIndex + 1}/{matches.length}
            </span>
            <button
              aria-label="Next search result"
              onClick={() => changeMatch(1)}
            >
              Next match
            </button>
          </>
        )}
        {searchStatus && (
          <p role="status" className="w-full">
            {searchStatus}
          </p>
        )}
      </div>
      <div
        ref={containerRef}
        className="mx-auto max-w-3xl overflow-x-auto px-2 pb-28 pt-6"
      >
        <Document
          file={fileUrl}
          options={PDF_OPTIONS}
          onLoadSuccess={onDocumentLoad}
          onLoadError={() => setError(true)}
          externalLinkTarget="_blank"
          externalLinkRel="noopener noreferrer nofollow"
          onItemClick={({ pageNumber }) => goToPage(pageNumber)}
          loading={<p className="py-20 text-sm">Loading PDF.</p>}
        >
          {!numPages && <p role="status">Measuring PDF pages...</p>}
          {ratios.map((ratio, index) => {
            const n = index + 1,
              isRead = marked !== null && n <= marked;
            return (
              <PdfPageFrame
                key={n}
                page={n}
                paperId={paperId}
                fingerprint={fingerprint}
                highlights={highlights.filter((h) => h.pdfAnchor?.page === n)}
                onChange={onHighlightChange}
                lockedPage={lockedPage}
                onLock={setLockedPage}
                requestedId={requestedHighlightId}
                onTargetMissing={onTargetMissing}
                ratio={ratio}
                width={pageWidth}
                isRead={isRead}
                rendered={
                  (n >= windowPages.first && n <= windowPages.last) ||
                  lockedPage === n
                }
              >
                {(n >= windowPages.first && n <= windowPages.last) ||
                lockedPage === n ? (
                  <Page
                    pageNumber={n}
                    width={pageWidth}
                    renderTextLayer
                    renderAnnotationLayer
                    renderForms={false}
                    onRenderTextLayerError={onTextFailure}
                    customTextRenderer={renderText}
                    onGetTextSuccess={({ items }) => {
                      if (
                        !items.some((item) => "str" in item && item.str.trim())
                      )
                        setEmptyPages((pages) =>
                          pages.has(n) ? pages : new Set([...pages, n]),
                        );
                    }}
                  />
                ) : (
                  <span className="p-3 text-xs text-muted-foreground">
                    Page {n}
                  </span>
                )}
                {emptyPages.has(n) && (
                  <p className="absolute bottom-2 left-2 right-2 bg-card/90 p-2 text-xs">
                    This page has no selectable text. Scanned pages require OCR.
                  </p>
                )}
              </PdfPageFrame>
            );
          })}
        </Document>
      </div>
      <ReaderBar
        marked={marked !== null}
        onMark={onMark}
        onClear={onClear}
        progressPct={progressPct}
        saveState={saveState}
        onRetry={retry}
      />
    </>
  );
}
