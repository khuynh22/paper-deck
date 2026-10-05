"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  createHighlight,
  updateHighlightNote,
  deleteHighlight,
} from "@/app/actions/highlights";
import { offsetsFromSelection } from "@/lib/reader/highlightRange";
import { normalizedRects, validPdfQuote } from "@/lib/reader/pdfAnchor";
import { runReaderAction } from "@/lib/reader/runReaderAction";
import {
  NOTE_MAX,
  QUOTE_MAX,
  type HighlightInput,
} from "@/lib/db/highlightRow";
import { mutationFailure } from "@/lib/mutationResult";
import { SaveStatus } from "@/components/SaveStatus";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";
import type { Highlight } from "@/lib/types";
import type { SaveState } from "@/lib/reader/progressSaver";
type Pending = { id: string; input: HighlightInput };
export function PdfPageAnnotations({
  page,
  paperId,
  fingerprint,
  rootRef,
  highlights,
  onChange,
  lockedPage,
  onLock,
  requestedId,
  onTargetMissing,
}: {
  page: number;
  paperId: string;
  fingerprint: string;
  rootRef: RefObject<HTMLDivElement | null>;
  highlights: Highlight[];
  onChange: (highlight: Highlight | null, id: string) => void;
  lockedPage: number | null;
  onLock: (page: number | null) => void;
  requestedId?: string;
  onTargetMissing: () => void;
}) {
  const [text, setText] = useState<string | null>(null),
    [pending, setPending] = useState<Pending | null>(null),
    [editing, setEditing] = useState<Highlight | null>(null),
    [draft, setDraft] = useState(""),
    draftRef = useRef(""),
    busy = useRef(false),
    located = useRef(false);
  const [state, setState] = useState<SaveState>({ status: "idle" }),
    [operation, setOperation] = useState<"create" | "save" | "delete">(
      "create",
    );
  const saving = state.status === "saving";
  useUnsavedChanges(
    saving ||
      state.status === "error" ||
      Boolean(editing && draft !== (editing.note ?? "")),
  );
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => {
      const layer = root.querySelector(".textLayer");
      setText(
        layer?.querySelector(".endOfContent")
          ? (layer.textContent ?? "")
          : null,
      );
    };
    const observer = new MutationObserver(update);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    update();
    return () => observer.disconnect();
  }, [rootRef]);
  useEffect(() => {
    if (!requestedId || located.current || text === null) return;
    const highlight = highlights.find((h) => h.id === requestedId);
    if (!highlight) return;
    const frame = requestAnimationFrame(() => {
      located.current = true;
      if (!validPdfQuote(highlight, page, fingerprint, text)) {
        onTargetMissing();
        return;
      }
      const mark = rootRef.current?.querySelector<HTMLElement>(
        `[data-pdf-highlight="${requestedId}"]`,
      );
      if (mark) {
        mark.scrollIntoView({ block: "center" });
        mark.focus({ preventScroll: true });
      } else onTargetMissing();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    requestedId,
    text,
    highlights,
    page,
    fingerprint,
    rootRef,
    onTargetMissing,
  ]);
  useEffect(() => {
    function select() {
      if (lockedPage !== null || busy.current || !fingerprint) return;
      const root = rootRef.current,
        selection = window.getSelection();
      if (!root || !selection || selection.isCollapsed || !selection.rangeCount)
        return;
      const layer = root.querySelector(".textLayer"),
        range = selection.getRangeAt(0);
      if (
        !layer ||
        !layer.contains(range.startContainer) ||
        !layer.contains(range.endContainer)
      )
        return;
      const offsets = offsetsFromSelection(layer, range);
      if (!offsets || offsets.quote.length > QUOTE_MAX) return;
      const rects = normalizedRects(
        range.getClientRects(),
        layer.getBoundingClientRect(),
      );
      if (!rects.length || rects.length > 100) return;
      setPending({
        id: crypto.randomUUID(),
        input: {
          paperId,
          blockAnchor: `pdf:${page}`,
          startOffset: offsets.start,
          endOffset: offsets.end,
          quote: offsets.quote,
          pdfAnchor: { page, fingerprint, rects },
        },
      });
      setState({ status: "idle" });
      onLock(page);
    }
    document.addEventListener("mouseup", select);
    document.addEventListener("touchend", select);
    return () => {
      document.removeEventListener("mouseup", select);
      document.removeEventListener("touchend", select);
    };
  }, [rootRef, paperId, page, fingerprint, lockedPage, onLock]);
  function close() {
    if (busy.current) return;
    setPending(null);
    setEditing(null);
    setState({ status: "idle" });
    onLock(null);
    window.getSelection()?.removeAllRanges();
  }
  async function persist(kind: "create" | "save" | "delete") {
    if (busy.current) return;
    busy.current = true;
    setOperation(kind);
    setState({ status: "saving" });
    const submitted = draftRef.current;
    try {
      if (kind === "create" && pending) {
        const result = await runReaderAction(() =>
          createHighlight(pending.input, pending.id),
        );
        if (!result.ok) {
          setState({ status: "error", error: result });
          return;
        }
        onChange(result.data, result.data.id);
        setPending(null);
        onLock(null);
        window.getSelection()?.removeAllRanges();
      } else if (editing) {
        const result = await runReaderAction(() =>
          kind === "delete"
            ? deleteHighlight(editing.id)
            : updateHighlightNote(editing.id, submitted.trim() || null),
        );
        if (!result.ok) {
          setState({ status: "error", error: result });
          return;
        }
        onChange(
          kind === "delete"
            ? null
            : { ...editing, note: submitted.trim() || null },
          editing.id,
        );
        if (kind === "delete" || submitted === draftRef.current) {
          setEditing(null);
          onLock(null);
        } else {
          setState({ status: "pending" });
          return;
        }
      } else return;
      setState({ status: "saved" });
    } catch (error) {
      setState({ status: "error", error: mutationFailure(error) });
    } finally {
      busy.current = false;
    }
  }
  return (
    <>
      {highlights
        .filter((h) => validPdfQuote(h, page, fingerprint, text))
        .flatMap((h) =>
          h.pdfAnchor!.rects.map((rect, index) => (
            <button
              key={`${h.id}-${index}`}
              data-pdf-highlight={h.id}
              aria-label={`PDF highlight: ${h.quote}`}
              title={h.note ?? h.quote}
              className="absolute z-10 bg-yellow-300/35 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              }}
              onClick={() => {
                if (lockedPage !== null) return;
                setEditing(h);
                draftRef.current = h.note ?? "";
                setDraft(draftRef.current);
                setState({ status: "idle" });
                onLock(page);
              }}
            />
          )),
        )}
      {(pending || editing) && (
        <div
          role="dialog"
          aria-label={pending ? "Save PDF highlight" : "Edit PDF note"}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-card p-4 shadow-xl"
        >
          <blockquote className="mb-3 max-h-28 overflow-auto border-l-2 border-accent pl-2 text-sm">
            {pending?.input.quote ?? editing?.quote}
          </blockquote>
          {editing && (
            <textarea
              aria-label="PDF note"
              maxLength={NOTE_MAX}
              value={draft}
              disabled={saving && operation === "delete"}
              onChange={(event) => {
                draftRef.current = event.target.value;
                setDraft(event.target.value);
              }}
              className="h-28 w-full rounded border border-line bg-background p-2 text-sm"
            />
          )}
          <SaveStatus state={state} onRetry={() => void persist(operation)} />
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <button disabled={saving} onClick={close}>
              Cancel
            </button>
            {editing && (
              <button
                disabled={saving}
                className="text-danger"
                onClick={() => void persist("delete")}
              >
                Delete highlight
              </button>
            )}
            <button
              disabled={saving || state.status === "error"}
              className="font-medium text-accent"
              onClick={() => void persist(pending ? "create" : "save")}
            >
              {pending ? "Save highlight" : "Save note"}
            </button>
          </div>
        </div>
      )}
      {!pending && !editing && state.status === "saved" && (
        <div className="fixed bottom-28 right-4 z-30 rounded bg-card p-2">
          <SaveStatus state={state} onRetry={() => void persist(operation)} />
        </div>
      )}
    </>
  );
}

export function PdfPageFrame({
  children,
  ratio,
  width,
  isRead,
  rendered,
  ...props
}: Omit<Parameters<typeof PdfPageAnnotations>[0], "rootRef"> & {
  children: ReactNode;
  ratio: number;
  width: number;
  isRead: boolean;
  rendered: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={rootRef}
      data-page={props.page}
      tabIndex={-1}
      aria-label={`PDF page ${props.page}`}
      className={`relative mx-auto mb-4 border ${isRead ? "border-[var(--read-accent)]" : "border-line"}`}
      style={{ width: width + 2, height: width * ratio + 2 }}
    >
      {isRead && (
        <span className="absolute right-2 top-2 z-10 rounded bg-accent px-1 text-xs text-white">
          read
        </span>
      )}
      {children}
      {rendered && <PdfPageAnnotations {...props} rootRef={rootRef} />}
    </div>
  );
}
