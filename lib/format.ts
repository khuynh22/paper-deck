import type { PaperRow } from "@/lib/types";

/** 151432 → "151k", 1900 → "1.9k", 312 → "312". */
export function fmtK(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return String(n);
}

export function authorLine(authors: string[]): string {
  if (authors.length === 0) return "Unknown authors";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

/** Recent papers get a full date ("Jun 10, 2026"); older ones just the year. */
export function dateLine(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ageMs = now.getTime() - d.getTime();
  if (ageMs > 365 * 24 * 60 * 60 * 1000) return String(d.getUTCFullYear());
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The one signal worth showing: citations beat upvotes beat stars beat "new". */
export function signalLine(paper: Pick<PaperRow, "citations" | "hf_upvotes" | "pwc_stars">): string {
  if (paper.citations > 0) return `${fmtK(paper.citations)} citations`;
  if (paper.hf_upvotes > 0) return `▲ ${paper.hf_upvotes}`;
  if (paper.pwc_stars > 0) return `${fmtK(paper.pwc_stars)} stars`;
  return "new";
}
