# Paper import semantics and release procedure

Imports use the service-role-only `merge_papers` RPC. Apply `0009_merge_papers.sql`
and **`20261026061656_enforce_unique_paper_identity.sql` before this app version**.
The latter replaces the entire RPC, including the fixes to the initially published
0009. It works when the original 0009 is already applied; editing migration history
alone does not update an existing database. Production migration history and data
have not been inspected or changed by this PR.

## Identity repair and compatibility

The corrective migration atomically consolidates legacy rows sharing a nonblank
`lower(btrim(doi))`, relinks their stars, reading progress, highlights and cached
content, then adds a unique index on that normalized DOI. Blank DOIs become null.
The canonical UUID is the earliest fetched row with an arXiv ID, otherwise the
earliest fetched row; UUID breaks ties. Metadata keeps populated canonical fields,
fills absent values, preserves longest authors and precise dates, unions categories,
and keeps maximum signals. Stars keep each user's earliest save date. Identical
progress states collapse with their latest timestamp; the position is never chosen
by maximum or recency when states differ. Highlight UUIDs, ranges and notes survive.
The selected cache is kept as an intact kind/HTML/page-count tuple.

The entire migration **aborts before any persistent change** if a duplicate group
has conflicting arXiv IDs, different progress for one user, progress with unknown
reader kind, incompatible caches used by saved state, missing/invalid state caches,
PDF source or reader-mode differences, or overlapping same-user highlights across
the duplicates. Diagnostics list DOI groups and reasons. An unexpected paper foreign
key also aborts rather than risking cascading deletion. Resolve those groups under
an explicitly reviewed data policy, then rerun; no policy silently discards a user's
position or note. The read-only `scripts/audit-ingestion.sql` reports those blockers.

Before relinking, full original paper/cache/user-state rows are snapshotted into
`paperdeck_ingestion_backup.paper_merges`. This schema has no API-role grants and
its table has RLS without policies. It contains private user data; only a database
operator may access it. Do not expose it through PostgREST or client code. Keep it
through release validation and an agreed recovery window; deletion is a separate
operator decision. The migration takes exclusive locks on all five affected tables
with a five-second lock acquisition timeout. Budget a maintenance window for the
actual corpus size and rehearse on a restricted staging copy.

Public, read-only `paper_redirects` maps removed UUIDs directly to the canonical
UUID. Detail/reader/API URLs redirect; API redirects retain options such as `?pdf=1`.
Progress loads/saves/clears, star changes, highlight loads/creation and idempotent
highlight retries canonicalize stale IDs while retaining authenticated ownership
checks. Highlight edits/deletes still use the original highlight UUID. API roles,
including service_role, cannot rewrite mappings. Target deletion is restricted so
an old saved link cannot silently lose its mapping.

## Import contract and concurrency

Nonempty supplied text and categories replace stored values. Null, undefined,
blank text and empty arrays mean unknown and preserve metadata. Imports cannot
explicitly clear those fields. Supplied signals, including zero, replace old
values; absent signals preserve them. Shorter author lists cannot replace longer
ones. Adapters encode year-only dates as January 1 at midnight UTC; these cannot
replace existing dates. This heuristic cannot distinguish a real January 1
midnight timestamp from year-only data without future provenance metadata.

Before batching, compatible arXiv IDs and normalized DOIs merge within the run,
including DOI/arXiv bridges. Identifier-free records merge by normalized nonblank
title only within that run. Conflicting arXiv IDs remain separate. Every supplied
DOI alias reaches the RPC for validation even when another DOI is chosen for
storage. Registry order supplies preferred text/URLs: arXiv, HF, PwC if enabled,
S2, conferences, Scholar; missing fields are filled, longest authors/precise dates
win, categories combine, and signals use their maximum. An independent later
import may replace signals with zero.

The RPC uses sorted advisory locks for only incoming arXiv/DOI identities, then
locks all existing matching rows in UUID order. Unrelated identities can import
concurrently. The unique DOI and arXiv indexes arbitrate insertion races;
`INSERT ... ON CONFLICT DO NOTHING` reselects and validates the winner, then merges
current fields. Reselection is bounded to three attempts. Identifiers that point
to two different existing papers remain a real conflict and fail that input;
uniqueness does not justify merging unrelated papers. A journal DOI may replace
an arXiv DOI for a matching arXiv identity; other alternate DOIs preserve the stored
DOI after validation. Every batch is bounded to 100 inputs. All ingestion writers
must use the RPC; direct multi-row writers do not share its lock-order contract.

Every deduplicated input returns inserted, updated, skipped (unchanged), or failed.
Each failed record rolls back independently, leaving successful records intact.
The caller validates unique in-range input indices before counting a response.
Transport or malformed RPC responses produce **unconfirmed** counts and retain
earlier confirmed results; these may have committed and are not confirmed failures.
Later batches still run. Identified records can be retried; identifier-free
records may duplicate on retry. Server logs retain RPC causes/batch offsets;
SQL warnings identify failed input index, SQLSTATE and reason.

Search/refresh show confirmed and unconfirmed counts, mark failures visibly and
invalidate feed/search after partial commits. Empty search has explicit feedback.
Cron returns 200 for mixed confirmed record outcomes and 500 for unconfirmed
batches, total record failure, thrown errors or source errors without confirmed
results. Source-health history remains issue #47.

## Verification and release gates

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`. Unit/component tests
mock upstream APIs and RPC transport. With local Supabase Docker running:

```powershell
node scripts/test-ingestion-db.mjs
$env:TEST_INGESTION_HTTP='1'
node scripts/test-ingestion-db.mjs
```

The harness creates and removes its own disposable databases in
`supabase_db_paper-deck` (`TEST_POSTGRES_CONTAINER` overrides the container). It
tests fresh migrations and upgrades from a frozen copy of original 0009 at
`5575063`, unsafe-group atomic rollback, safe cleanup, every user reference,
private snapshots, RLS isolation, normalized uniqueness and migration replay.
It observes same-identity contention, proves unrelated imports finish while the
first transaction stays open, exercises opposite-order identifiers of existing
rows, and forces a real unique-conflict race against a direct insert. Set
`TEST_INGESTION_FAIL_CONCURRENT=1` to test cleanup on failure (nonzero expected).

HTTP mode runs the real app import caller and Supabase client against a disposable
PostgREST container, reusing existing local gateway JWTs in memory. It creates no
credentials. It verifies actual stored metadata/zero/partial outcomes, conflicts,
anonymous denial, batch bounds, public old-ID resolution and mapping-write denial.
Temporary API/container/database resources are removed on success and failure.
These are real local integrations; they do not verify live provider APIs,
production data or an authenticated browser session.

Before merging, follow [PRE-MERGE-CHECKLIST.md](PRE-MERGE-CHECKLIST.md). For rollout:

1. With **read-only** production access, inspect migration history and run
   `scripts/audit-ingestion.sql`. Obtain a recoverable database backup; rehearse
   all pending migrations against a restricted staging copy. Any unsafe group,
   unexpected FK, state loss, or unplanned migration is a release blocker.
2. Schedule a maintenance pause covering imports/cron, reader cache writes and
   user saves. Drain old workers/in-flight requests. Stop writes before migration
   preflight; an earlier audit can become stale. This PR does not automate or
   authorize that production maintenance or any data repair.
3. Apply all pending migrations through the corrective migration as a database
   operator. On lock timeout or an unsafe-group error, keep maintenance paused,
   inspect the diagnostic and retry only after the blocker is understood. The
   failing migration rolls back atomically. Never delete user rows to force it.
4. Verify no normalized duplicate DOI groups, a valid unique index, expected
   redirects/state counts, and denied API access to the recovery snapshot.
   Deploy this app version and drain/restart all old workers before reopening
   traffic. New code requires `paper_redirects`; an old binary cannot safely
   operate after consolidation. Confirm old UUIDs and stale-tab saves in staging.
5. Reopen writes only after those gates pass. Monitor failed/unconfirmed counts,
   SQL identity warnings and reader-save failures. Keep the recovery backup.

Rollback before reopening writes can restore the pre-migration database backup
and old app together. After new writes, do not blindly restore archived rows or
an old database snapshot: that would overwrite later user activity. Keep the new
identity-compatible app, fix forward or reconcile subsequent writes under a
reviewed recovery plan. Snapshot retention is not a turnkey down migration.
