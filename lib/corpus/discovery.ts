import type { FeedTab } from "@/lib/types";

export const PAGE_SIZE = 40;
export const MAX_PAGE = 2501;
export type DiscoveryInput = Record<string, string | string[] | undefined>;
export interface DiscoveryParams {
  q: string; topic: string; venue: string; from: string; to: string;
  tab: FeedTab; page: number; asOf: string; invalid: boolean;
}

export function parseDiscovery(input: DiscoveryInput, now = new Date()): DiscoveryParams {
  let invalid = false;
  function text(key: string, max: number) {
    const raw = input[key];
    if (raw === undefined) return "";
    if (typeof raw !== "string" || raw.length > max || /[\u0000-\u001f\u007f]/.test(raw)) { invalid = true; return ""; }
    return raw.trim();
  }
  function date(key: string) {
    const value = text(key, 10);
    if (!value) return "";
    const parsed = new Date(value + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000") || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) { invalid = true; return ""; }
    return value;
  }
  const q = text("q", 300), venue = text("venue", 120);
  let topic = text("topic", 64);
  if (topic && !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(topic)) { invalid = true; topic = ""; }
  let from = date("from"), to = date("to");
  if (from && to && from > to) { invalid = true; from = ""; to = ""; }
  const rawPage = text("page", 8);
  let page = rawPage ? Number(rawPage) : 1;
  if ((rawPage && !/^[1-9]\d*$/.test(rawPage)) || !Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) { invalid = true; page = 1; }
  const rawTab = text("tab", 20);
  const tab = ["latest", "trending", "famous"].includes(rawTab) ? rawTab as FeedTab : "latest";
  if (rawTab && rawTab !== tab) invalid = true;
  const rawAsOf = text("asof", 30);
  let asOf = now.toISOString();
  if (rawAsOf) {
    const time = Date.parse(rawAsOf);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(rawAsOf) || !Number.isFinite(time)) { invalid = true; page = 1; }
    else {
      asOf = new Date(time).toISOString();
      if (asOf !== (rawAsOf.length === 20 ? rawAsOf.replace("Z", ".000Z") : rawAsOf) || asOf.startsWith("0000")) { invalid = true; asOf = now.toISOString(); }
    }
  } else if (page > 1) { invalid = true; page = 1; }
  if (invalid) page = 1;
  return { q, topic, venue, from, to, tab, page, asOf, invalid };
}

export function discoveryHref(path: "/" | "/search", params: DiscoveryParams, changes: Partial<DiscoveryParams> = {}) {
  const p = { ...params, ...changes };
  const search = new URLSearchParams();
  for (const key of ["q", "topic", "venue", "from", "to"] as const) if (p[key]) search.set(key, p[key]);
  if (path === "/" && p.tab !== "latest") search.set("tab", p.tab);
  if (p.page > 1) search.set("page", String(p.page));
  search.set("asof", p.asOf);
  return `${path}?${search}`;
}

export function hasFilters(p: DiscoveryParams) { return Boolean(p.topic || p.venue || p.from || p.to); }
