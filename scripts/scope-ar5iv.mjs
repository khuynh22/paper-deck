#!/usr/bin/env node
/**
 * Transforms _ar5iv.css (ar5iv.0.8.5.css from arxiv) into a version scoped
 * under .paper-html so it doesn't pollute the app shell.
 *
 * Transformations applied:
 *   :root { }               → .paper-html { }
 *   body { }                → .paper-html { }
 *   img { }                 → .paper-html img { }
 *   math, mjx-container { } → .paper-html math, .paper-html mjx-container { }
 *   mtd { }                 → .paper-html mtd { }
 *   [style*="--ltx-"]       → .paper-html [style*="--ltx-"]
 *   section.ltx_*           → .paper-html section.ltx_*
 *   mjx-merror              → .paper-html mjx-merror
 *
 *   [data-theme="dark"] blocks are stripped entirely — ar5iv uses a toggle
 *   attribute for dark mode but our app uses prefers-color-scheme. Dark mode
 *   is handled via our CSS var overrides in globals.css instead.
 *
 *   @supports blocks that only contain [data-theme="dark"] rules are stripped.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");

const src = readFileSync(join(root, "_ar5iv.css"), "utf8");
const lines = src.split("\n");
const out = [];

// State machine
let skipBraceDepth = 0; // >0 means we're inside a block we're skipping
let lookAhead = ""; // for @supports lookahead

function transformLine(line) {
  return (
    line
      // :root → .paper-html
      .replace(/^:root \{/, ".paper-html {")
      // body → .paper-html (ar5iv uses body as layout root; we use .paper-html)
      .replace(/^body \{/, ".paper-html {")
      // bare img → .paper-html img
      .replace(/^img \{/, ".paper-html img {")
      // math, (multiline selector) → .paper-html math,
      .replace(/^math,$/, ".paper-html math,")
      // mjx-container → .paper-html mjx-container
      .replace(/^mjx-container \{/, ".paper-html mjx-container {")
      // mtd → .paper-html mtd
      .replace(/^mtd \{/, ".paper-html mtd {")
      // [style*="--ltx-..."] attribute selectors
      .replace(/^\[style\*="--ltx-/, '.paper-html [style*="--ltx-')
      // section.ltx_* → .paper-html section.ltx_*
      .replace(/^(section\.ltx_)/, ".paper-html $1")
      // mjx-merror → .paper-html mjx-merror
      .replace(/^mjx-merror/, ".paper-html mjx-merror")
  );
}

function countBraces(line) {
  let d = 0;
  for (const ch of line) {
    if (ch === "{") d++;
    else if (ch === "}") d--;
  }
  return d;
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  // --- Skip mode: we're inside a block we want to drop ---
  if (skipBraceDepth > 0) {
    skipBraceDepth += countBraces(line);
    if (skipBraceDepth === 0) out.push(""); // closing brace line → blank
    continue;
  }

  // --- Detect [data-theme="dark"] rules to skip ---
  if (/^\[data-theme="dark"\]/.test(trimmed)) {
    skipBraceDepth = countBraces(line);
    // If the block doesn't open on this line, look for it
    if (skipBraceDepth === 0) {
      // Single-line selector without brace — shouldn't happen in this file
      out.push("");
    }
    continue;
  }

  // --- Detect @supports blocks that ONLY contain [data-theme="dark"] ---
  if (/^@supports/.test(trimmed)) {
    // Peek ahead to see if the first real content is [data-theme="dark"]
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    if (j < lines.length && /\[data-theme="dark"\]/.test(lines[j])) {
      // This @supports block is exclusively for dark-theme overrides → skip
      skipBraceDepth = countBraces(line);
      if (skipBraceDepth === 0) skipBraceDepth = 1; // block opens on next line
      continue;
    }
  }

  out.push(transformLine(line));
}

const result = out.join("\n");

mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(join(root, "public", "ar5iv.css"), result);

const origLines = lines.length;
const outLines = out.filter((l) => l.trim()).length;
console.log(
  `Done. ${origLines} lines → ${out.length} lines (${outLines} non-empty). Written to public/ar5iv.css`
);
