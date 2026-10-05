import { AsyncLocalStorage } from "node:async_hooks";

export interface SourceContext {
  deadline: number;
  warnings: string[];
  successes?: number;
}
export const sourceContext = new AsyncLocalStorage<SourceContext>();

export class SourceError extends Error {
  constructor(public code: "timeout" | "network" | "http" | "format", public status?: number) {
    super(status ? `Upstream HTTP ${status}` : `Upstream ${code}`);
  }
}

/** Store only fixed error categories, never URLs, query strings, tokens or bodies. */
export function safeSourceError(error: unknown): string {
  return error instanceof SourceError ? error.message : "Source failed";
}

export function sourceWarning(label: string, error: unknown) {
  sourceContext.getStore()?.warnings.push(`${label}: ${safeSourceError(error)}`);
}

export function sourceSuccess() {
  const context = sourceContext.getStore();
  if (context) context.successes = (context.successes ?? 0) + 1;
}

export function retryDelay(value: string | null, now: number): number {
  if (!value) return 500;
  const seconds = Number(value);
  return Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now) || 500;
}

/** Include the body in the timeout; return a buffered response to existing parsers. */
export async function sourceFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const deadline = sourceContext.getStore()?.deadline ?? Date.now() + 25_000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SourceError("timeout");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(6_000, remaining));
    let failure: SourceError;
    let delay = 500 * 2 ** attempt;
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok) {
        const body = await response.arrayBuffer();
        return new Response(body, { status: response.status, headers: response.headers });
      }
      failure = new SourceError("http", response.status);
      const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
      delay = Math.max(delay, retryDelay(response.headers.get("retry-after"), Date.now()));
      await response.body?.cancel();
      if (!retryable) throw failure;
    } catch (error) {
      if (error instanceof SourceError) throw error;
      failure = new SourceError(controller.signal.aborted ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
    // Do not shorten Retry-After to fit the budget: report the failure instead.
    if (attempt === 2 || Date.now() + delay >= deadline) throw failure!;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new SourceError("network");
}
