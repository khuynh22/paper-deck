"use client";

import type { SaveState } from "@/lib/reader/progressSaver";

export function saveStatusText(state: SaveState): string {
  return state.status === "saved" ? "Saved" : state.status === "pending" ? "Unsaved changes" :
    state.status === "saving" ? "Saving…" : "";
}

export function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs" role="alert">
        <span>{state.error.message}</span>
        {state.error.code === "auth" && (
          <a href="/login" target="_blank" rel="noreferrer" className="font-semibold underline">
            Sign in in a new tab
          </a>
        )}
        {(state.error.code === "storage" || state.error.code === "auth") && (
          <button type="button" onClick={onRetry} className="font-semibold underline">Retry</button>
        )}
      </div>
    );
  }
  return <span className="text-xs text-muted-foreground">{saveStatusText(state)}</span>;
}
