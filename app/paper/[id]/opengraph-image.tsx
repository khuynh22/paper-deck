import { ImageResponse } from "next/og";
import { getPaper } from "@/lib/corpus/query";
import { authorLine, signalLine } from "@/lib/format";
import { clampText } from "@/lib/meta";

export const alt = "PaperDeck paper preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Literal colors (ImageResponse can't read CSS vars) mirroring the light theme.
const BG = "#faf8f4";
const INK = "#211b14";
const MUTED = "#837a6d";
const ACCENT = "#a03b2e";

/** Brand wordmark row: the two-sheet mark (mirrors BrandMark) + "PaperDeck". */
function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex", position: "relative", width: 34, height: 40 }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 12,
            width: 22,
            height: 28,
            borderRadius: 5,
            background: ACCENT,
            opacity: 0.28,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 9,
            left: 0,
            width: 22,
            height: 28,
            borderRadius: 5,
            background: ACCENT,
          }}
        />
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: INK }}>PaperDeck</div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let paper = null;
  try {
    paper = await getPaper(id);
  } catch (err) {
    // Never 500 the unfurl — fall through to the generic card. But log, so a
    // real failure (DB down, etc.) isn't silently invisible.
    console.error(`opengraph-image: failed to load paper ${id}`, err);
  }

  // `||` not `??`: an empty categories array joins to "", which should still fall back.
  const kicker = paper?.categories.slice(0, 3).join("  ·  ") || "AI / ML RESEARCH";
  const title = clampText(paper?.title, 140) || "Your AI/ML research, on one deck";
  const authors = paper ? authorLine(paper.authors) : "";
  const signal = paper ? signalLine(paper) : "";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          position: "relative", // containing block for the absolute accent bar below
          width: "100%",
          height: "100%",
          background: BG,
          padding: 64,
          paddingLeft: 80,
        }}
      >
        <div
          style={{ position: "absolute", top: 0, left: 0, width: 12, height: "100%", background: ACCENT }}
        />
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
          <div
            style={{
              fontSize: 24,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            {kicker}
          </div>
          <div
            style={{
              // Real 3-line clamp: Satori honors -webkit-line-clamp only with
              // display:-webkit-box (plain overflow:hidden on a flex box did
              // nothing). Long arXiv titles now truncate instead of crowding
              // the author line / footer.
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 3,
              overflow: "hidden",
              fontSize: 60,
              fontWeight: 700,
              lineHeight: 1.12,
              color: INK,
              marginTop: 28,
            }}
          >
            {title}
          </div>
          {authors && (
            <div style={{ fontSize: 28, color: MUTED, marginTop: 24 }}>{authors}</div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "auto",
            }}
          >
            <Wordmark />
            {signal && <div style={{ fontSize: 26, color: ACCENT, fontWeight: 600 }}>{signal}</div>}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
