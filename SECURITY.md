# Security Policy

## Supported versions

PaperDeck is pre-1.0; only the latest `master` is supported with security fixes.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, use GitHub's private vulnerability reporting:
<https://github.com/khuynh22/paper-deck/security/advisories/new>

Please include reproduction steps and the potential impact. You can expect an initial
response within a few days. Once a fix ships, we'll credit you in the advisory unless
you prefer otherwise.

## Scope notes for self-hosters

- `SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security — keep it server-side only
  and never expose it in client bundles or logs.
- The reader renders sanitized third-party HTML (arXiv/ar5iv). Sanitizer bypasses in
  `lib/reader/` are the highest-severity class of bug here — reports very welcome.
- `CRON_SECRET` protects the ingestion endpoint; rotate it if leaked.
