export function boundedPage(value: number, total: number) {
  return Math.min(
    Math.max(1, Math.trunc(Number.isFinite(value) ? value : 1)),
    Math.max(1, total),
  );
}
export function pageWindow(page: number, total: number) {
  const current = boundedPage(page, total);
  return {
    first: Math.max(1, current - 2),
    last: Math.min(total, current + 2),
  };
}
export function pdfTextMarkup(text: string, query: string) {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  if (!query) return escape(text);
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "gi",
  );
  let from = 0,
    result = "";
  for (const match of text.matchAll(pattern)) {
    result +=
      escape(text.slice(from, match.index)) +
      `<mark>${escape(match[0])}</mark>`;
    from = match.index + match[0].length;
  }
  return result + escape(text.slice(from));
}
