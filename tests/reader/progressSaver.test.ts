import { afterEach, expect, test, vi } from "vitest";
import { ProgressSaver } from "@/lib/reader/progressSaver";
import type { ProgressUpdate } from "@/lib/db/progressRow";
import type { MutationResult } from "@/lib/mutationResult";

const OK: MutationResult = { ok: true, data: undefined };
const FAILURE: MutationResult = { ok: false, code: "storage", message: "Retry" };
afterEach(() => vi.useRealTimers());

test("failed mark + later clear + scroll retry writes only the latest intent", async () => {
  const persisted: ProgressUpdate[] = [];
  let finish!: (r: MutationResult) => void;
  const saver = new ProgressSaver(async update => {
    persisted.push(update);
    if (persisted.length === 1) return new Promise(resolve => { finish = resolve; });
    return OK;
  });
  saver.enqueue({ markedPct: 0.8, status: "done", scrollPct: 0.8 }, true);
  saver.enqueue({ markedPct: 0, status: "reading" }, true);
  finish(FAILURE);
  await vi.waitFor(() => expect(saver.getSnapshot().status).toBe("error"));
  saver.enqueue({ scrollPct: 0.2, blockAnchor: "2" });
  expect(saver.getSnapshot().status).toBe("error");
  await saver.flush(true);
  expect(persisted).toEqual([
    { markedPct: 0.8, status: "done", scrollPct: 0.8 },
    { markedPct: 0, status: "reading", scrollPct: 0.2, blockAnchor: "2" },
  ]);
  expect(saver.getSnapshot().status).toBe("saved");
});

test("scrolling after failure does not automatically retry the failing write", async () => {
  vi.useFakeTimers();
  const write = vi.fn(async () => FAILURE);
  const saver = new ProgressSaver(write);
  saver.enqueue({ markedPct: 0.4 }, true);
  await Promise.resolve();
  saver.enqueue({ scrollPct: 0.7 });
  await vi.advanceTimersByTimeAsync(2000);
  expect(write).toHaveBeenCalledTimes(1);
  expect(saver.getSnapshot().status).toBe("error");
});

test("scroll-only autosaves retain a failed mark and pause after transport rejection", async () => {
  const write = vi.fn<(u: ProgressUpdate) => Promise<MutationResult>>()
    .mockRejectedValueOnce(new Error("offline")).mockResolvedValue(OK);
  const saver = new ProgressSaver(write);
  saver.enqueue({ markedPct: 0.4, status: "reading" }, true);
  await Promise.resolve();
  saver.enqueue({ scrollPct: 0.8 });
  await saver.flush(true);
  expect(write).toHaveBeenLastCalledWith({ markedPct: 0.4, status: "reading", scrollPct: 0.8 });
});
