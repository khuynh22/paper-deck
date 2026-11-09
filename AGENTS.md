<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Code Review Rules

- Paper imports must preserve absent metadata and distinguish an observed zero
  from an absent signal. Check DOI/arXiv aliases, partial failures, and concurrent
  imports against `docs/INGESTION.md`; never repair identity conflicts by silently
  deleting or relinking existing user data.
- Stars, reading progress, and highlights belong to the authenticated user. Flag
  changes that bypass ownership checks or RLS, or expose service-role credentials
  to clients. Shared-corpus writes must stay behind the trusted server boundary.
- Reader HTML comes from external sources. Preserve sanitization and URL-fetch
  restrictions when changing the reader or its cache; upstream content must not
  gain script execution or access to private network resources.
