# Public share pages + OpenGraph unfurls

**Date:** 2026-07-10
**Status:** Approved (design)
**Scope:** The public paper page (`/paper/[id]`) — rich link-unfurl metadata, a
dynamically-generated OG image, and a **Share** affordance. No DB changes.

## Background

Every action in PaperDeck today is single-player: browse, star, read. Nothing a
user does produces a link worth sending to someone else, so there is no loop that
pulls a second person in. The one shareable surface we already have is the paper
detail page — `/paper/[id]` already renders **without** auth (only star/progress
state is gated behind a signed-in user) and there is **no route-gating middleware**.
So the page is public; what's missing is:

1. Link-preview metadata, so a pasted `/paper/[id]` URL unfurls into a real card in
   Slack / iMessage / Twitter / Discord instead of a bare URL.
2. A branded preview **image** for that card.
3. An in-app **Share** button so a reader can grab the link in one tap.

This is the smallest, most self-contained slice of "loops that bring other people
in" and the highest-leverage: every read becomes a spreadable link, and every link
is an ad for the app that the recipient can use immediately (no signup wall).

## Decision

Add three things, no schema changes:

- **`generateMetadata`** on `/paper/[id]` producing title, description, canonical
  URL, and OpenGraph + Twitter tags.
- A file-convention **`opengraph-image.tsx`** in the same segment that renders a
  1200×630 branded card (title, category kicker, author line, one signal, wordmark).
  Next auto-injects it as `og:image` / `twitter:image` for the page.
- A client **`ShareButton`** in the paper action row: `navigator.share` where
  available (mobile), else copy-to-clipboard with a transient "Copied" state.

Supporting config:

- **`lib/site.ts`** — a single source of truth for the absolute site origin, used
  for `metadataBase`, the canonical URL, and the OG `og:url`.
- **`NEXT_PUBLIC_SITE_URL`** added to the env schema (optional) and DEPLOY docs.

## Site URL (`lib/site.ts`)

OG/canonical tags require an **absolute** origin; relative URLs don't unfurl.
Resolve it once, with a precedence that works in every environment:

```ts
export const SITE_URL: string = normalize(
  process.env.NEXT_PUBLIC_SITE_URL              // explicit, e.g. https://ppdeck.com
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL // Vercel-injected prod domain
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined)
  ?? "http://localhost:3000",                   // local dev
);
export const paperPath = (id: string) => `/paper/${id}`;
export const paperUrl  = (id: string) => `${SITE_URL}${paperPath(id)}`;
```

`normalize` strips a trailing slash. `SITE_URL` is a module constant (read at
module load) — fine because the value is fixed per deploy. Added to `lib/env.ts`
schema as `NEXT_PUBLIC_SITE_URL: z.string().url().optional()` for validation/docs;
`lib/site.ts` reads `process.env` directly so the constant inlines at build for any
client import.

## Metadata

### Root (`app/layout.tsx`)

Add `metadataBase: new URL(SITE_URL)` (lets Next resolve relative image/canonical
paths to absolute) plus site-level `openGraph` defaults (siteName "PaperDeck",
type "website") and `twitter: { card: "summary_large_image" }`. Existing
title/description template is kept.

### Per paper (`app/paper/[id]/page.tsx`)

`getPaper` is wrapped in React `cache()` so `generateMetadata` and the page body
share one fetch per request (the route stays `force-dynamic`).

Add `export async function generateMetadata({ params })`:

- Missing paper → `{ title: "Paper not found" }` (the page still `notFound()`s).
- Build via a **pure helper** `paperMetadata(paper, url)` in `lib/meta.ts` so the
  tag-shaping logic is unit-testable without a server:
  - `title`: `paper.title`.
  - `description`: `clampText(paper.abstract, 200)` (word-boundary clip + "…"),
    falling back to the author line when there's no abstract.
  - `alternates.canonical`: the paper URL.
  - `openGraph`: `{ type: "article", url, title, description, publishedTime }`.
  - `twitter`: `{ card: "summary_large_image", title, description }`.
  - Image tags are **not** set here — the `opengraph-image` file convention injects
    them automatically for both `og:` and `twitter:`.

## OG image (`app/paper/[id]/opengraph-image.tsx`)

`ImageResponse` from `next/og`, `size = { width: 1200, height: 630 }`,
`contentType = "image/png"`. Default async export receives `{ params }`, fetches the
paper (cached `getPaper`), and renders a branded card. If the paper is missing, fall
back to a generic PaperDeck card (never throw — a broken OG route would 500 the
unfurl).

Layout (flex, literal hex colors — `ImageResponse` can't read CSS vars; values
mirror the **light** theme in `globals.css`):

- Canvas: background `#faf8f4`, 64px padding, a 12px brick-red (`#a03b2e`) bar down
  the left edge.
- Category kicker: mono-ish, uppercase, `#837a6d`, the first ~3 `categories`.
- Title: large (~60px), bold, `#211b14`, clamped to ~140 chars, `lineClamp` 3.
- Author line: `authorLine(paper.authors)`, ~28px, `#837a6d`.
- Footer row: PaperDeck wordmark + accent square (inline, mirrors `BrandMark`) on
  the left; `signalLine(paper)` (e.g. "12,904 citations") on the right, amber
  `#a03b2e`/`#837a6d`.

**Fonts:** v1 uses `ImageResponse`'s built-in default font — no network font fetch,
so the route can't fail on a font CDN and needs no bundled asset. Matching the
Newsreader serif is a noted future enhancement (load a `.ttf` via `fetch` + `fonts`
option).

## Share button (`components/ShareButton.tsx`)

Client component, styled to match `StarButton variant="detail"` (42px pill, `border
border-line`, hover `border-accent`). Props: `{ path, title }`.

- URL built client-side as `${window.location.origin}${path}` (canonical, ignores
  any query/hash on the current URL). `path` comes from `paperPath(paper.id)`.
- On click:
  - If `navigator.share` exists → `navigator.share({ title, url })`; swallow
    `AbortError` (user dismissed the sheet).
  - Else `navigator.clipboard.writeText(url)` → set `copied` true, show "Copied",
    reset after ~1.6s (guarded so it works under fake timers / unmount).
- Label: "Share" → "Copied" on the clipboard path. `aria-label` stays "Share link".
  Icon: simple share/link glyph (inline SVG, same stroke conventions as StarIcon).

Placed in the paper action row (`app/paper/[id]/page.tsx`) between `StarButton` and
the external arXiv/PDF links.

## Testing

- `lib/site` — `SITE_URL` precedence (explicit env > Vercel > localhost) and
  trailing-slash normalization via a pure `resolveSiteUrl(env)` that `SITE_URL`
  calls; `paperPath`/`paperUrl` shape.
- `lib/meta` — `clampText` (short passes through, long clips on a word boundary with
  "…", null → fallback); `paperMetadata` sets title, clamped description, canonical,
  `openGraph.type = "article"`, `twitter.card = "summary_large_image"`, and uses the
  author line when abstract is null.
- `components/ShareButton` (jsdom):
  - No `navigator.share` → click writes the canonical URL to the clipboard and flips
    the label to "Copied".
  - `navigator.share` present → click calls it with `{ url }`; clipboard not touched.
  - A dismissed share (`AbortError`) does not surface an error.

## Out of scope

- Shareable collections / reading lists (feature 1b — needs new tables + RLS).
- Shareable passage anchors (feature 1c).
- OG metadata on the interactive `/reader/[id]` view.
- Custom serif font in the OG image (noted enhancement).
- Public sitemap / JSON-LD (that's the separate "SEO surface" item).
