"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createHighlight, deleteHighlight, updateHighlightNote } from "@/app/actions/highlights";
import {
  offsetsFromSelection,
  decorateBlock,
  clearHighlights,
  MARK_CLASS,
  type DecorateTarget,
} from "@/lib/reader/highlightRange";
import { runReaderAction } from "@/lib/reader/runReaderAction";
import { SaveStatus } from "@/components/SaveStatus";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";
import { newHighlightId } from "@/lib/reader/highlightId";
import type { SaveState } from "@/lib/reader/progressSaver";
import { NOTE_MAX } from "@/lib/db/highlightRow";
import { Button } from "@/components/ui";
import type { Highlight } from "@/lib/types";

type Pending = {
  requestId: string;
  x: number;
  y: number;
  blockAnchor: string;
  start: number;
  end: number;
  quote: string;
};
type Editing = { id: string; x: number; y: number };

export function HighlightLayer({
  paperId,
  containerRef,
  initialHighlights,
}: {
  paperId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  initialHighlights: Highlight[];
}) {
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);
  const [pending, setPending] = useState<Pending | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const draftRef = useRef("");
  // Keep uncertain creation IDs across Cancel and reselection in this reader.
  const failedCreationIds = useRef(new Map<string, string>());
  const busy = useRef(false);
  const locked = useRef(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [lastOperation, setLastOperation] = useState<"create" | "note" | "delete">("create");
  const saving = saveState.status === "saving";
  useEffect(() => {
    if (saveState.status !== "saved") return;
    const timer = setTimeout(() => setSaveState((current) =>
      current.status === "saved" ? { status: "idle" } : current), 2000);
    return () => clearTimeout(timer);
  }, [saveState]);
  useUnsavedChanges(saving || saveState.status === "error" || Boolean(editing &&
    noteDraft !== (highlights.find((h) => h.id === editing.id)?.note ?? "")));

  // Keep a ref so click handlers bound into the DOM read current highlights
  // without changing identity (which would thrash the repaint effect).
  const hlRef = useRef(highlights);
  useEffect(() => {
    hlRef.current = highlights;
  }, [highlights]);

  const openEditor = useCallback(
    (id: string) => {
      if (locked.current) return;
      locked.current = true;
      setPending(null);
      setSaveState({ status: "idle" });
      const root = containerRef.current;
      const mark = root?.querySelector<HTMLElement>(`mark.${MARK_CLASS}[data-hl-id="${id}"]`);
      const rect = mark?.getBoundingClientRect();
      const h = hlRef.current.find((x) => x.id === id);
      setEditing({ id, x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
      draftRef.current = h?.note ?? "";
      setNoteDraft(draftRef.current);
    },
    [containerRef],
  );

  // (Re)paint marks whenever the highlight set changes.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    clearHighlights(root);
    const byBlock = new Map<string, DecorateTarget[]>();
    for (const h of highlights) {
      const target: DecorateTarget = {
        id: h.id,
        startOffset: h.startOffset,
        endOffset: h.endOffset,
        quote: h.quote,
        hasNote: !!h.note,
      };
      const arr = byBlock.get(h.blockAnchor) ?? [];
      arr.push(target);
      byBlock.set(h.blockAnchor, arr);
    }
    for (const [blk, targets] of byBlock) {
      const block = root.querySelector(`[data-blk="${blk}"]`);
      if (block) decorateBlock(block, targets, openEditor);
    }
    return () => clearHighlights(root);
  }, [highlights, containerRef, openEditor]);

  // Show the "Highlight" button when a fresh selection sits inside one block.
  useEffect(() => {
    function onMouseUp(event: MouseEvent) {
      if (locked.current || (event.target instanceof Element && event.target.closest("[data-highlight-controls]"))) return;
      const root = containerRef.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPending(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const block = (range.startContainer.parentElement ?? null)?.closest("[data-blk]");
      if (!block || !root.contains(block)) {
        setPending(null);
        return;
      }
      // No overlaps in v1: ignore selections that touch an existing mark.
      if (range.cloneContents().querySelector(`mark.${MARK_CLASS}`)) {
        setPending(null);
        return;
      }
      const offsets = offsetsFromSelection(block, range);
      if (!offsets) {
        setPending(null);
        return;
      }
      // Range.getBoundingClientRect exists in browsers but not jsdom; fall back to 0s.
      const rect =
        typeof range.getBoundingClientRect === "function"
          ? range.getBoundingClientRect()
          : { left: 0, top: 0, width: 0 };
      setSaveState({ status: "idle" });
      setPending({
        requestId: failedCreationIds.current.get(`${block.getAttribute("data-blk")}\0${offsets.start}\0${offsets.end}\0${offsets.quote}`) ?? newHighlightId(),
        x: rect.left + rect.width / 2,
        y: rect.top,
        blockAnchor: block.getAttribute("data-blk") ?? "",
        start: offsets.start,
        end: offsets.end,
        quote: offsets.quote,
      });
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [containerRef]);

  function cancel() {
    if (busy.current) return;
    locked.current = false;
    setPending(null);
    setEditing(null);
    setSaveState({ status: "idle" });
    window.getSelection()?.removeAllRanges();
  }

  async function confirmHighlight() {
    if (!pending || busy.current) return;
    busy.current = true;
    locked.current = true;
    setLastOperation("create");
    setSaveState({ status: "saving" });
    const selectionKey = `${pending.blockAnchor}\0${pending.start}\0${pending.end}\0${pending.quote}`;
    try {
      const result = await runReaderAction(() => createHighlight({
        paperId,
        blockAnchor: pending.blockAnchor,
        startOffset: pending.start,
        endOffset: pending.end,
        quote: pending.quote,
        note: null,
      }, pending.requestId));
      if (!result.ok) {
        failedCreationIds.current.set(selectionKey, pending.requestId);
        setSaveState({ status: "error", error: result });
        return;
      }
      failedCreationIds.current.delete(selectionKey);
      setHighlights((hs) => [...hs.filter((h) => h.id !== result.data.id), result.data]);
      setPending(null);
      locked.current = false;
      window.getSelection()?.removeAllRanges();
      setSaveState({ status: "saved" });
    } finally {
      busy.current = false;
    }
  }

  async function saveNote() {
    if (!editing || busy.current) return;
    busy.current = true;
    setLastOperation("note");
    const submittedDraft = draftRef.current;
    const note = submittedDraft.trim() || null;
    setSaveState({ status: "saving" });
    try {
      const result = await runReaderAction(() => updateHighlightNote(editing.id, note));
      if (!result.ok) {
        setSaveState({ status: "error", error: result });
        return;
      }
      setHighlights((hs) => hs.map((h) => h.id === editing.id ? { ...h, note } : h));
      // The textarea stays editable during a slow save. Its newer text must not
      // be discarded or described as saved by this older acknowledgement.
      if (draftRef.current === submittedDraft) {
        setEditing(null);
        locked.current = false;
        setSaveState({ status: "saved" });
      } else {
        setSaveState({ status: "pending" });
      }
    } finally {
      busy.current = false;
    }
  }

  async function removeHighlight() {
    if (!editing || busy.current) return;
    busy.current = true;
    setLastOperation("delete");
    setSaveState({ status: "saving" });
    try {
      const result = await runReaderAction(() => deleteHighlight(editing.id));
      if (!result.ok) {
        setSaveState({ status: "error", error: result });
        return;
      }
      setHighlights((hs) => hs.filter((h) => h.id !== editing.id));
      setEditing(null);
      locked.current = false;
      setSaveState({ status: "saved" });
    } finally {
      busy.current = false;
    }
  }

  function retry() {
    void (lastOperation === "create" ? confirmHighlight() :
      lastOperation === "delete" ? removeHighlight() : saveNote());
  }

  return (
    <>
      {!pending && !editing && saveState.status === "saved" && (
        <div className="fixed bottom-36 right-4 z-30 rounded-xl bg-card px-3 py-2 shadow-md">
          <SaveStatus state={saveState} onRetry={retry} />
        </div>
      )}
      {pending && (
        <div
          data-highlight-controls
          className="pd-enter fixed z-30 -translate-x-1/2 -translate-y-full pb-2"
          style={{ left: pending.x, top: pending.y }}
        >
          <Button
            variant="primary"
            className="h-8 px-3 text-xs shadow-md"
            onClick={confirmHighlight}
            disabled={saving || saveState.status === "error"}
          >
            Highlight
          </Button>
          <div className="mt-1 max-w-72 rounded-xl bg-card p-2 shadow-md">
            <SaveStatus state={saveState} onRetry={retry} />
            <button type="button" className="mt-1 text-xs underline" disabled={saving} onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      {editing && (
        <div
          data-highlight-controls
          className="pd-enter fixed z-30 w-72 rounded-xl border border-line bg-card p-3 shadow-lg"
          style={{ left: editing.x, top: editing.y + 6 }}
        >
          <textarea
            aria-label="Note"
            className="h-24 w-full resize-none rounded-md border border-line bg-background p-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            placeholder="Add a note…"
            value={noteDraft}
            maxLength={NOTE_MAX}
            disabled={saving && lastOperation === "delete"}
            onChange={(e) => {
              draftRef.current = e.target.value;
              setNoteDraft(e.target.value);
            }}
          />
          <SaveStatus state={saveState} onRetry={retry} />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={removeHighlight}
              disabled={saving}
              className="text-xs font-medium text-danger hover:underline"
            >
              Delete
            </button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="h-8 px-3 text-xs"
                onClick={cancel}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button variant="primary" className="h-8 px-3 text-xs" disabled={saving} onClick={saveNote}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
