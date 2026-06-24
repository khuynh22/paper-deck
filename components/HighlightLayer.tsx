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
import { Button } from "@/components/ui";
import type { Highlight } from "@/lib/types";

type Pending = {
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

  // Keep a ref so click handlers bound into the DOM read current highlights
  // without changing identity (which would thrash the repaint effect).
  const hlRef = useRef(highlights);
  useEffect(() => {
    hlRef.current = highlights;
  }, [highlights]);

  const openEditor = useCallback(
    (id: string) => {
      const root = containerRef.current;
      const mark = root?.querySelector<HTMLElement>(`mark.${MARK_CLASS}[data-hl-id="${id}"]`);
      const rect = mark?.getBoundingClientRect();
      const h = hlRef.current.find((x) => x.id === id);
      setEditing({ id, x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
      setNoteDraft(h?.note ?? "");
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
    function onMouseUp() {
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
      setPending({
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

  async function confirmHighlight() {
    if (!pending) return;
    const created = await createHighlight({
      paperId,
      blockAnchor: pending.blockAnchor,
      startOffset: pending.start,
      endOffset: pending.end,
      quote: pending.quote,
      note: null,
    });
    setPending(null);
    window.getSelection()?.removeAllRanges();
    if (created) setHighlights((hs) => [...hs, created]);
  }

  async function saveNote() {
    if (!editing) return;
    const note = noteDraft.trim() || null;
    await updateHighlightNote(editing.id, note);
    setHighlights((hs) => hs.map((h) => (h.id === editing.id ? { ...h, note } : h)));
    setEditing(null);
  }

  async function removeHighlight() {
    if (!editing) return;
    await deleteHighlight(editing.id);
    setHighlights((hs) => hs.filter((h) => h.id !== editing.id));
    setEditing(null);
  }

  return (
    <>
      {pending && (
        <div
          className="pd-enter fixed z-30 -translate-x-1/2 -translate-y-full pb-2"
          style={{ left: pending.x, top: pending.y }}
        >
          <Button
            variant="primary"
            className="h-8 px-3 text-xs shadow-md"
            onClick={confirmHighlight}
          >
            Highlight
          </Button>
        </div>
      )}

      {editing && (
        <div
          className="pd-enter fixed z-30 w-72 rounded-xl border border-line bg-card p-3 shadow-lg"
          style={{ left: editing.x, top: editing.y + 6 }}
        >
          <textarea
            aria-label="Note"
            className="h-24 w-full resize-none rounded-md border border-line bg-background p-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            placeholder="Add a note…"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={removeHighlight}
              className="text-xs font-medium text-danger hover:underline"
            >
              Delete
            </button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="h-8 px-3 text-xs"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button variant="primary" className="h-8 px-3 text-xs" onClick={saveNote}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
