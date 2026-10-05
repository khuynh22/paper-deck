"use client";
import { useState } from "react";
type Props = {
  paperId?: string;
  papers?: { id: string; title: string }[];
  notes?: boolean;
};
export function ExportControls({ paperId, papers, notes }: Props) {
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download(
    scope: "paper" | "library" | "selected" | "notes",
    format: "bib" | "md",
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, format, paperId, ids: selected }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Export failed. Please retry.");
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? `paper-deck.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Export failed. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Research exports"
      className="my-4 rounded-xl border border-line p-3 text-sm"
    >
      <div className="flex flex-wrap gap-4">
        {paperId ? (
          <>
            <button
              disabled={busy}
              className="text-accent underline"
              onClick={() => void download("paper", "bib")}
            >
              Download BibTeX
            </button>
            <button
              disabled={busy}
              className="text-accent underline"
              onClick={() => void download("paper", "md")}
            >
              Download my notes
            </button>
          </>
        ) : notes ? (
          <button
            disabled={busy}
            className="text-accent underline"
            onClick={() => void download("notes", "md")}
          >
            Download all my notes
          </button>
        ) : (
          <button
            disabled={busy}
            className="text-accent underline"
            onClick={() => void download("library", "bib")}
          >
            Download all library citations
          </button>
        )}
      </div>
      {papers && papers.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer">
            Select citations from this page
          </summary>
          <div className="my-3 space-y-2">
            {papers.map((p) => (
              <label key={p.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(event) =>
                    setSelected((ids) =>
                      event.target.checked
                        ? [...ids, p.id]
                        : ids.filter((id) => id !== p.id),
                    )
                  }
                />
                <span>{p.title}</span>
              </label>
            ))}
          </div>
          <button
            disabled={busy || !selected.length}
            className="text-accent underline disabled:opacity-50"
            onClick={() => void download("selected", "bib")}
          >
            Download selected citations ({selected.length})
          </button>
        </details>
      )}
      {busy && (
        <p role="status" className="mt-2">
          Preparing complete export…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
