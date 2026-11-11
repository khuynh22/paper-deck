"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { saveProgress } from "@/lib/reader/mutations";
import { runReaderAction } from "@/lib/reader/runReaderAction";
import { ProgressSaver } from "@/lib/reader/progressSaver";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";
import type { ProgressUpdate } from "@/lib/db/progressRow";

export function useProgressSave(paperId: string, onAcknowledged?: (update: ProgressUpdate) => void) {
  const router = useRouter();
  // ReaderView keys readers by paperId, giving each paper its own queue.
  const [saver] = useState(() => new ProgressSaver(async (update) => {
    const result = await runReaderAction(() => saveProgress(paperId, update));
    if (result.ok) router.refresh();
    return result;
  },
    onAcknowledged,
  ));
  const state = useSyncExternalStore(saver.subscribe, saver.getSnapshot, saver.getSnapshot);
  const explicitUnsaved = Boolean(state.explicit) &&
    (state.status === "pending" || state.status === "saving" || state.status === "error");
  useUnsavedChanges(state.status === "error" || explicitUnsaved);
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") void saver.flush(); };
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      // Capture happens on scroll, before refs disappear. Best-effort flush on
      // SPA unmount; failed drafts remain on-page until retried or discarded.
      void saver.flush();
    };
  }, [saver]);
  return { state, explicitUnsaved, enqueue: saver.enqueue, retry: saver.retry };
}
