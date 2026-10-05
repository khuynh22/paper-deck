# PDF reading

The reader enables PDF.js text and annotation layers, page controls, zoom, and document search. Search indexes text lazily and reports matching pages, complete-search failures, and image-only documents explicitly. It does not perform OCR. PDF text supplied to the search renderer is HTML-escaped before adding match marks. PDF.js evaluation is disabled, form rendering remains disabled, and external links open with `noopener noreferrer nofollow`.

Page dimensions are read before mounting the document layout. Every page has a measured placeholder, while only the current page and two neighbors on either side mount React-PDF pages (at most five canvases). This keeps canvas use bounded without changing scroll height when pages enter the window. Resize and zoom preserve the current page's fractional offset. Resume uses the saved page with a percentage fallback for older records, and finished-here markers continue using acknowledged progress writes.

The sticky toolbar offset is computed from its fixed position and current height, rather than its pre-scroll screen position. Internal PDF destinations use a stable callback reading the current page-count ref because React-PDF captures its initial navigation callback.

Browser fixtures cover a 60-page document with varying dimensions, exact page-40 resume, zoom/resize, search/selection, keyboard page and external-link access, internal navigation to page 60, safe/unsafe URI annotations, and a scanned document. Existing PDF marker and HTML persistence tests remain enabled. The production browser path is authoritative; the previously documented webpack development PDF import limitation is separate.

This is the first part of issue #54. Private PDF annotations, geometry anchoring, notes and export integration are delivered in a dependent change.
