# Paper imports

Import maintainers should use the service-role-only `merge_papers` RPC for every
corpus writer. It merges DOI/arXiv identities and preserves existing enrichment.

- Null, omitted, blank text and empty arrays mean unknown; they cannot clear data.
  Supplied signals, including zero, replace old values. Shorter author lists and
  year-only dates preserve fuller metadata. January 1 midnight UTC is treated as
  year-only, including genuine timestamps at that instant.
- Within a run, compatible identities merge before batching. Source order is
  arXiv, HF, PwC, S2, conferences, Scholar; longest authors, precise dates, unioned
  categories and maximum signals win. Identifier-free titles deduplicate only
  within that run and may duplicate on retry.
- DOI aliases are validated against arXiv identity. A journal DOI may replace an
  arXiv DOI; conflicting identities fail instead of merging unrelated papers.
- Batches contain at most 100 inputs. Each returns inserted, updated, skipped or
  failed; bad inputs do not discard successful ones. Transport/malformed-response
  errors are **unconfirmed** because writes may have committed. Earlier confirmed
  counts remain, later batches continue, and feed/search refresh after partial saves.
- Cron returns 200 for mixed confirmed outcomes; unconfirmed batches, total failure,
  thrown errors or source errors without confirmed results return 500. RPC causes
  and per-record SQL warnings are logged server-side.

## Production upgrade

Apply all pending migrations before deploying, including:

1. `0009_merge_papers.sql`
2. `20261026061656_enforce_unique_paper_identity.sql`
3. `20261103070847_grant_application_table_access.sql`

The corrective migration replaces the original RPC and consolidates compatible
duplicate normalized DOIs. It preserves stars, exact progress, highlight UUIDs,
notes and compatible cached content, then adds DOI uniqueness and old-UUID redirects.
Conflicting identities/progress, unknown reader kinds, incompatible or missing
state caches, PDF differences, overlapping highlights or unexpected foreign keys
abort the whole migration. Never discard user state to force it through.

1. Inspect production's schema/history and run `scripts/audit-ingestion.sql` through
   a read-only connection. Obtain a recoverable backup and rehearse pending changes
   on a restricted copy, recording user-state counts. Staging's June migrations
   were reconciled to `0003`–`0008` only while empty; production still uses timestamped
   versions. Reconcile history against the actual schema before planning an upgrade;
   do not replay staging's reconciliation on populated data.
2. Pause all writers, including imports/cron, reader cache writes and user saves;
   drain old workers and requests before migration preflight. The migration takes
   exclusive table locks with a five-second lock timeout. Investigate any timeout
   or unsafe-group diagnostic before retrying.
3. Apply pending migrations; verify state preservation, no normalized DOI duplicates,
   a valid unique index, old-UUID redirects and API permissions. Original rows are
   retained in private `paperdeck_ingestion_backup.paper_merges`; API roles must
   remain unable to access that schema.
4. Deploy the new app and drain old workers before reopening writes. An old app
   cannot safely operate after consolidation. Verify old detail/reader URLs, PDF
   options and a reader tab opened before the upgrade: progress, star changes and
   pending highlight retries must use the canonical paper without losing edits.

Before writes reopen, rollback restores the pre-migration database and old app
together. After new writes, fix forward or reconcile later activity; restoring an
old snapshot would lose it. Retain recovery snapshots through the recovery window.

## Verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build`. With local Supabase
Docker running, run `node scripts/test-ingestion-db.mjs`; set
`TEST_INGESTION_HTTP=1` to include the real app/PostgREST integration tests.
The harness creates/removes disposable databases in `supabase_db_paper-deck`
(`TEST_POSTGRES_CONTAINER` overrides it). A successful run exits zero; failures
report the failed assertion. Use [staging](DEPLOY.md#staging) for live browser checks.
