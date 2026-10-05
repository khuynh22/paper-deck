import { parseDocument, DomUtils } from "htmlparser2";
import type { Highlight } from "@/lib/types";
export function passageVerifier(html: string | null) {
  const blocks = new Map<string, string>();
  if (html)
    for (const node of DomUtils.findAll(
      (element) => Object.hasOwn(element.attribs, "data-blk"),
      parseDocument(html).children,
    ))
      blocks.set(node.attribs["data-blk"], DomUtils.textContent(node));
  return (highlight: Highlight) =>
    Boolean(
      blocks.has(highlight.blockAnchor) &&
      highlight.endOffset > highlight.startOffset &&
      blocks
        .get(highlight.blockAnchor)!
        .slice(highlight.startOffset, highlight.endOffset) === highlight.quote,
    );
}
