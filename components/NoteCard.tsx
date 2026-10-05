"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateHighlightNote, deleteHighlight } from "@/app/actions/highlights";
import { runReaderAction } from "@/lib/reader/runReaderAction";
import { mutationFailure } from "@/lib/mutationResult";
import { NOTE_MAX } from "@/lib/db/highlightRow";
import type { SaveState } from "@/lib/reader/progressSaver";
import type { NoteRow } from "@/lib/notes/params";
import { SaveStatus } from "@/components/SaveStatus";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";

export function NoteCard({ entry }: { entry: NoteRow }) {
  const router = useRouter(),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(entry.note ?? ""),
    draftRef = useRef(draft),
    [state, setState] = useState<SaveState>({ status: "idle" }),
    [operation, setOperation] = useState<"save" | "delete">("save"),
    busy = useRef(false);
  const saving = state.status === "saving";
  useUnsavedChanges(
    saving ||
      state.status === "error" ||
      (editing && draft !== (entry.note ?? "")),
  );
  async function persist(kind: "save" | "delete") {
    if (busy.current) return;
    busy.current = true;
    setOperation(kind);
    setState({ status: "saving" });
    const submitted = draftRef.current;
    try {
      const result = await runReaderAction(() =>
        kind === "save"
          ? updateHighlightNote(entry.id, submitted.trim() || null)
          : deleteHighlight(entry.id),
      );
      if (!result.ok) {
        setState({ status: "error", error: result });
        return;
      }
      if (kind === "delete" || draftRef.current === submitted) {
        setEditing(false);
        setState({ status: "saved" });
      } else setState({ status: "pending" });
      router.refresh();
    } catch (error) {
      setState({ status: "error", error: mutationFailure(error) });
    } finally {
      busy.current = false;
    }
  }
  return (
    <article
      className="border-b border-line py-5"
      aria-label={`Note on ${entry.paper_title}`}
    >
      <Link
        href={`/paper/${entry.paper_id}`}
        className="font-serif text-lg font-medium text-accent"
      >
        {entry.paper_title}
      </Link>
      <p className="mt-1 text-xs text-muted-foreground">
        <time dateTime={entry.updated_at}>
          {new Date(entry.updated_at).toISOString().slice(0, 10)}
        </time>
      </p>
      <blockquote className="my-3 border-l-2 border-accent pl-3 text-sm leading-relaxed">
        {entry.quote}
      </blockquote>
      {editing ? (
        <textarea
          aria-label="Edit note"
          value={draft}
          maxLength={NOTE_MAX}
          disabled={saving && operation === "delete"}
          onChange={(event) => {
            draftRef.current = event.target.value;
            setDraft(event.target.value);
          }}
          className="min-h-28 w-full rounded border border-line bg-card p-3 text-sm"
        />
      ) : entry.note ? (
        <p className="whitespace-pre-wrap text-sm">{entry.note}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Highlight without a note
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <Link
          href={`/reader/${entry.paper_id}?highlight=${entry.id}`}
          className="text-accent underline"
        >
          Open passage
        </Link>
        {editing ? (
          <>
            <button
              disabled={saving}
              onClick={() => void persist("save")}
              className="font-medium underline"
            >
              Save note
            </button>
            <button
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setState({ status: "idle" });
              }}
              className="underline"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              draftRef.current = entry.note ?? "";
              setDraft(draftRef.current);
              setEditing(true);
              setState({ status: "idle" });
            }}
            className="underline"
          >
            Edit note
          </button>
        )}
        <button
          disabled={saving}
          onClick={() => void persist("delete")}
          className="text-danger underline"
        >
          Delete highlight
        </button>
      </div>
      <div className="mt-2">
        <SaveStatus state={state} onRetry={() => void persist(operation)} />
      </div>
    </article>
  );
}
