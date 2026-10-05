import type { ProgressUpdate } from "@/lib/db/progressRow";
import { mutationFailure, type MutationFailure, type MutationResult } from "@/lib/mutationResult";

export type SaveState = { status: "idle" | "pending" | "saving" | "saved" } |
  { status: "error"; error: MutationFailure };

/** Coalesce partial updates, but never send overlapping progress writes. */
export class ProgressSaver {
  private pending: ProgressUpdate | null = null;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private state: SaveState = { status: "idle" };
  private listeners = new Set<() => void>();

  constructor(private write: (update: ProgressUpdate) => Promise<MutationResult>) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.state;

  private publish(state: SaveState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  enqueue = (update: ProgressUpdate, immediate = false) => {
    this.pending = { ...this.pending, ...update };
    clearTimeout(this.timer);
    // A failure pauses autosaves. Scrolling can update the retained draft, but
    // only an explicit retry resumes writes (no retry storm while offline).
    if (this.state.status === "error") return;
    this.publish({ status: this.running ? "saving" : "pending" });
    if (immediate) void this.flush();
    else this.timer = setTimeout(() => { void this.flush(); }, 600);
  };

  retry = () => { void this.flush(true); };

  flush = async (retry = false): Promise<void> => {
    clearTimeout(this.timer);
    if (this.running || !this.pending || (this.state.status === "error" && !retry)) return;
    const sent = this.pending;
    this.pending = null;
    this.running = true;
    this.publish({ status: "saving" });
    let result: MutationResult;
    try {
      result = await this.write(sent);
    } catch (error) {
      result = mutationFailure(error);
    }
    this.running = false;
    if (!result.ok) {
      // Newer fields win; retain older fields (e.g. a mark) that newer scrolls
      // didn't supply. Retry sends intent, never a fresh viewport measurement.
      this.pending = { ...sent, ...(this.pending as ProgressUpdate | null) };
      this.publish({ status: "error", error: result });
    } else if (this.pending) {
      await this.flush();
    } else {
      this.publish({ status: "saved" });
    }
  };
}
