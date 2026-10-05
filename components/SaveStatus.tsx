"use client";

import type { SaveState } from "@/lib/reader/progressSaver";

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
        {state.error.code !== "validation" && (
          <button type="button" onClick={onRetry} className="font-semibold underline">Retry</button>
        )}
      </div>
    );
  }
  return <span role="status" className="text-xs text-muted-foreground">{
    state.status === "saved" ? "Saved" : state.status === "pending" ? "Unsaved changes" : "Saving…"
  }</span>;
}
