import type { ProgressUpdate } from "@/lib/db/progressRow";
import { mutationFailure, type MutationFailure, type MutationResult } from "@/lib/mutationResult";

export type SaveState = { status: "idle" | "pending" | "saving" | "saved"; explicit?: boolean } |
  { status: "error"; error: MutationFailure; explicit?: boolean };

/** Coalesce partial updates, but never send overlapping progress writes. */
export class ProgressSaver {
  private pending: ProgressUpdate | null = null;
  private explicitPending = false;
  private explicitRunning = false;
  private explicitAcknowledged = false;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private state: SaveState = { status: "idle", explicit: false };
  private listeners = new Set<() => void>();

  constructor(
    private write: (update: ProgressUpdate) => Promise<MutationResult>,
    private onAcknowledged?: (update: ProgressUpdate) => void,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.state;

  private publish(state: SaveState) {
    clearTimeout(this.settleTimer);
    this.state = state;
    this.listeners.forEach((listener) => listener());
    if (state.status === "saved") {
      this.settleTimer = setTimeout(() => {
        if (this.state === state) this.publish({ status: "idle", explicit: false });
      }, 2000);
    }
  }

  enqueue = (update: ProgressUpdate, immediate = false) => {
    this.pending = { ...this.pending, ...update };
    this.explicitPending ||= immediate;
    clearTimeout(this.timer);
    // Background scrolling pauses after a failure. A deliberate Mark/Clear is
    // itself a retry, using the latest intent instead of the failed snapshot.
    if (this.state.status === "error" && !immediate) return;
    this.publish({ status: this.running ? "saving" : "pending", explicit: this.explicitPending || this.explicitRunning });
    if (immediate) void this.flush(true);
    else this.timer = setTimeout(() => { void this.flush(); }, 600);
  };

  retry = () => { void this.flush(true); };

  flush = async (retry = false): Promise<void> => {
    clearTimeout(this.timer);
    if (this.running || !this.pending || (this.state.status === "error" && !retry)) return;
    const sent = this.pending;
    const sentExplicit = this.explicitPending;
    this.pending = null;
    this.explicitPending = false;
    this.explicitRunning = sentExplicit;
    this.running = true;
    this.publish({ status: "saving", explicit: sentExplicit });
    let result: MutationResult;
    try {
      result = await this.write(sent);
    } catch (error) {
      result = mutationFailure(error);
    }
    this.running = false;
    this.explicitRunning = false;
    if (result.ok) this.onAcknowledged?.(sent);
    if (!result.ok) {
      // Newer fields win; retain older fields (e.g. a mark) that newer scrolls
      // didn't supply. Retry sends intent, never a fresh viewport measurement.
      this.pending = { ...sent, ...(this.pending as ProgressUpdate | null) };
      this.explicitPending ||= sentExplicit;
      this.publish({ status: "error", error: result, explicit: this.explicitPending });
    } else if (this.pending) {
      this.explicitAcknowledged ||= sentExplicit;
      await this.flush();
    } else {
      // Scroll-only saves are deliberately quiet during normal reading.
      const showSaved = sentExplicit || this.explicitAcknowledged;
      this.explicitAcknowledged = false;
      this.publish(showSaved ? { status: "saved", explicit: true } : { status: "idle", explicit: false });
    }
  };
}
