import type { PaperRow, Highlight } from "@/lib/types";

export function safeUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function canonicalUrl(paper: PaperRow, origin: string) {
  return (
    (paper.doi
      ? safeUrl(`https://doi.org/${encodeURIComponent(paper.doi)}`)
      : null) ??
    (paper.arxiv_id
      ? safeUrl(`https://arxiv.org/abs/${encodeURIComponent(paper.arxiv_id)}`)
      : null) ??
    safeUrl(paper.source_url) ??
    `${origin}/paper/${paper.id}`
  );
}
export function bibEscape(value: string) {
  const replacements: Record<string, string> = {
    "\\": "\\textbackslash{}",
    "{": "\\{",
    "}": "\\}",
    $: "\\$",
    "&": "\\&",
    "%": "\\%",
    "#": "\\#",
    _: "\\_",
    "^": "\\textasciicircum{}",
    "~": "\\textasciitilde{}",
  };
  return value
    .replace(/[\\{}$&%#_^~]/g, (char) => replacements[char])
    .replace(/[\u0000-\u001f\u007f]+/g, " ");
}
export function bibtex(papers: PaperRow[], origin: string): string {
  return (
    [...new Map(papers.map((p) => [p.id, p])).values()]
      .map((p) => {
        const fields: Record<string, string> = {
          title: `{${bibEscape(p.title)}}`,
        };
        if (p.authors.length)
          fields.author = p.authors
            .map((a) => `{${bibEscape(a)}}`)
            .join(" and ");
        const year = p.published_at?.match(/^(\d{4})-/)?.[1];
        if (year) fields.year = year;
        if (p.venue) fields.howpublished = bibEscape(p.venue);
        if (p.doi) fields.doi = bibEscape(p.doi);
        if (p.arxiv_id) {
          fields.eprint = bibEscape(p.arxiv_id);
          fields.archivePrefix = "arXiv";
        }
        fields.url = bibEscape(canonicalUrl(p, origin));
        // Full UUID avoids metadata-based collisions and remains stable as metadata improves.
        return `@misc{paper${p.id.replaceAll("-", "")},\n${Object.entries(
          fields,
        )
          .map(([key, value]) => `  ${key} = {${value}}`)
          .join(",\n")}\n}`;
      })
      .join("\n\n") + "\n"
  );
}
function text(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+.!|~-])/g, "\\$1");
}
function literal(value: string) {
  const longest = Math.max(
    2,
    ...Array.from(value.matchAll(/`+/g), (m) => m[0].length),
  );
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${value}\n${fence}`;
}
export interface ExportNote {
  highlight: Highlight;
  passageValid: boolean;
}
export function markdown(
  papers: PaperRow[],
  notes: ExportNote[],
  origin: string,
): string {
  return (
    "# PaperDeck notes\n\n" +
    papers
      .map((p) => {
        const own = notes.filter((n) => n.highlight.paperId === p.id);
        const identifiers = [
          p.doi ? `DOI: ${text(p.doi)}` : "",
          p.arxiv_id ? `arXiv: ${text(p.arxiv_id)}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          `## ${text(p.title)}\n\n${text(p.authors.join(", ") || "Unknown authors")}\n\n[Source](<${canonicalUrl(p, origin).replaceAll(">", "%3E").replaceAll("<", "%3C")}>)\n${identifiers ? `\n${identifiers}\n` : ""}\n` +
          (own.length
            ? own
                .map(
                  ({ highlight: h, passageValid }) =>
                    `### Saved passage\n\n${h.pdfAnchor ? `PDF page ${h.pdfAnchor.page}\n\n` : ""}${literal(h.quote)}\n\n${h.note !== null ? `Note:\n\n${literal(h.note)}\n\n` : ""}${passageValid ? `[Open passage](${origin}/reader/${p.id}?highlight=${h.id})` : `${h.pdfAnchor ? "Open the PDF reader to validate this saved passage." : "Passage unavailable in the current source."} [Open paper](${origin}/paper/${p.id})`}\n`,
                )
                .join("\n")
            : "No saved highlights or notes.\n")
        );
      })
      .join("\n")
  );
}
export function filename(label: string, extension: "bib" | "md") {
  return `${
    label
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "paper-deck"
  }.${extension}`;
}
