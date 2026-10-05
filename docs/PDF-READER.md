# PDF reading

The reader enables PDF.js text and annotation layers, page controls, zoom, and document search. Search indexes text lazily and reports matching pages, complete-search failures, and image-only documents explicitly. It does not perform OCR. PDF text supplied to the search renderer is HTML-escaped before adding match marks. PDF.js evaluation is disabled, form rendering remains disabled, and external links open with `noopener noreferrer nofollow`.

Page dimensions are read before mounting the document layout. Every page has a measured placeholder, while only the current page and two neighbors on either side mount React-PDF pages (at most five canvases). This keeps canvas use bounded without changing scroll height when pages enter the window. Resize and zoom preserve the current page's fractional offset. Resume uses the saved page with a percentage fallback for older records, and finished-here markers continue using acknowledged progress writes.

The sticky toolbar offset is computed from its fixed position and current height, rather than its pre-scroll screen position. Internal PDF destinations use a stable callback reading the current page-count ref because React-PDF captures its initial navigation callback.

Browser fixtures cover a 60-page document with varying dimensions, exact page-40 resume, zoom/resize, search/selection, keyboard page and external-link access, internal navigation to page 60, safe/unsafe URI annotations, and a scanned document. Existing PDF marker and HTML persistence tests remain enabled. The production browser path is authoritative; the previously documented webpack development PDF import limitation is separate.

The reading phase and the private annotation phase are separate dependent changes for issue #54.

## Private annotations

Migration `0015_pdf_annotations.sql` adds an optional `pdf_anchor` JSON object to existing highlights. HTML rows remain unchanged. PDF anchors include the PDF.js document fingerprint, one-based page, normalized rectangles and the existing exact quote/offsets. Server validation and a database constraint reject missing or out-of-page geometry. Existing owner RLS applies to both formats.

Select text within one PDF page to create a highlight; activate the painted highlight to edit or delete its note. Stable request IDs make creation retries idempotent, including a committed save with a lost response. A page with an open draft remains mounted outside the ordinary render window, for a maximum of six canvases. Saves acknowledge durable results and failed drafts remain editable/retryable. Deep links wait for the completed text layer, validate identity and quote, then focus the passage; changed or unavailable sources preserve the saved quote in a fallback.

My Notes includes PDF annotations automatically. Markdown exports preserve their text and page number; exports do not fetch and revalidate external PDFs, so PDF passage links are omitted in favor of paper attribution. Scanned pages still require OCR and cannot create text highlights. Hosted migration application remains part of the normal release process.
