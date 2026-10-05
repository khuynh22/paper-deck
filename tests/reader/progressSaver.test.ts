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

test("scroll saves are background activity, but explicit marks require leave protection", async () => {
  let finish!: (result: MutationResult) => void;
  const saver = new ProgressSaver(() => new Promise(resolve => { finish = resolve; }));
  saver.enqueue({ scrollPct: 0.2 });
  expect(saver.getSnapshot()).toMatchObject({ status: "pending", explicit: false });
  void saver.flush();
  expect(saver.getSnapshot()).toMatchObject({ status: "saving", explicit: false });
  saver.enqueue({ markedPct: 0.5, status: "reading" }, true);
  expect(saver.getSnapshot()).toMatchObject({ status: "saving", explicit: true });
  finish(FAILURE);
  await vi.waitFor(() => expect(saver.getSnapshot()).toMatchObject({ status: "error", explicit: true }));
});

test("an explicit mark retries after a failed background scroll without a separate Retry click", async () => {
  const write = vi.fn<(u: ProgressUpdate) => Promise<MutationResult>>()
    .mockResolvedValueOnce(FAILURE).mockResolvedValue(OK);
  const saver = new ProgressSaver(write);
  saver.enqueue({ scrollPct: 0.2 });
  await saver.flush();
  expect(saver.getSnapshot().status).toBe("error");
  saver.enqueue({ markedPct: 0.7, status: "reading" }, true);
  await vi.waitFor(() => expect(saver.getSnapshot().status).toBe("saved"));
  expect(write).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenLastCalledWith({ scrollPct: 0.2, markedPct: 0.7, status: "reading" });
});

test("a mark still shows Saved when a later scroll is queued during its write", async () => {
  const finishes: Array<(result: MutationResult) => void> = [];
  const write = vi.fn(() => new Promise<MutationResult>(resolve => { finishes.push(resolve); }));
  const saver = new ProgressSaver(write);
  saver.enqueue({ markedPct: 0.5 }, true);
  saver.enqueue({ scrollPct: 0.7 });
  finishes[0](OK);
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  finishes[1](OK);
  await vi.waitFor(() => expect(saver.getSnapshot()).toMatchObject({ status: "saved", explicit: true }));
});
