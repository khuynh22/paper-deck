import { parseDiscovery } from "@/lib/corpus/discovery";
export type InterestCriteria = {
  q: string;
  topic: string;
  venue: string;
  author: string;
  from: string;
  to: string;
};
export type Interest = InterestCriteria & {
  id: string;
  name: string;
  paused: boolean;
  lastSeenAt: string | null;
};
export const EMPTY_CRITERIA: InterestCriteria = {
  q: "",
  topic: "",
  venue: "",
  author: "",
  from: "",
  to: "",
};
export function validateInterest(
  name: unknown,
  raw: unknown,
): { name: string; criteria: InterestCriteria } | null {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 80 ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    !raw ||
    typeof raw !== "object"
  )
    return null;
  const value = raw as Record<string, unknown>;
  if (Object.keys(EMPTY_CRITERIA).some((k) => typeof value[k] !== "string"))
    return null;
  const p = parseDiscovery(value as Record<string, string>);
  const author = (value.author as string).trim();
  if (p.invalid || author.length > 200 || /[\u0000-\u001f\u007f]/.test(author))
    return null;
  const criteria = {
    q: p.q,
    topic: p.topic,
    venue: p.venue,
    from: p.from,
    to: p.to,
    author,
  };
  return Object.values(criteria).some(Boolean)
    ? { name: name.trim(), criteria }
    : null;
}
export function describeCriteria(c: InterestCriteria) {
  return [
    c.q && `Search: ${c.q}`,
    c.topic && `Category: ${c.topic}`,
    c.venue && `Venue: ${c.venue}`,
    c.author && `Author name: ${c.author}`,
    c.from && `From ${c.from}`,
    c.to && `Through ${c.to}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
