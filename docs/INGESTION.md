# Paper import semantics

Imports use the service-role-only `merge_papers` RPC introduced in migration
`0009_merge_papers.sql`. Apply the migration before releasing these callers.
Anonymous and authenticated API clients cannot invoke the import RPC.
If the original 0009 has already been applied, publish the revised function as a
new corrective migration first; editing an applied migration file does not update
the database. Production migration history has not been checked by this change.

Nonempty supplied text and categories replace the corresponding stored value.
Null, undefined, empty text, and empty author/category arrays mean unknown and
preserve existing metadata. Imports cannot explicitly clear those fields.
Supplied numeric signals, including zero, replace older values; absent signals
preserve them. New records use database defaults for absent fields. Adapters must
not turn absent upstream signals into zero. A shorter author list cannot replace
a longer stored list. Adapters encode year-only dates as January 1 at midnight
UTC; such a value cannot replace an existing date. Other supplied timestamps can
replace older values. This heuristic cannot distinguish a real January 1 midnight
timestamp from a year-only date without future provenance metadata.

Before batching, imports deduplicate compatible arXiv and normalized DOI
identities, including DOI-only/arXiv bridges. Identifier-free records with the
same nonblank normalized title merge only within that run. Conflicting arXiv IDs
or different journal DOIs remain separate inputs for database identity checks.
Within a duplicate group, the first source supplies text/URLs, missing values are
filled, the longest author list and precise date win, categories are combined,
and numeric signals use their maximum (including explicit zero). Source results
follow registry order regardless of network completion: arXiv, HF, PwC if enabled,
S2, conferences, Scholar. An independent later import can replace numeric signals
with zero. Across imports, the database lock determines order.

Identity uses arXiv ID or trimmed, case-insensitive DOI. A DOI-only paper can later
gain its arXiv ID. If supplied identifiers refer to different existing papers, or
a legacy DOI has multiple matches, that input fails without deleting, relinking,
or merging existing papers and their associated user data. Papers without either
identifier can still be inserted, but cannot be reliably deduplicated on retry;
titles alone are not used to match stored rows. For one matching arXiv identity,
a journal DOI replaces a `10.48550/arxiv.*` DOI; otherwise the stored DOI is kept.
An alternate DOI that identifies another existing row still fails explicitly.

The RPC serializes import transactions with an advisory lock and locks matching
rows before merging. It reads current fields inside the transaction, so concurrent
partial imports retain independently supplied metadata. Each batch contains at
most 100 records to bound lock duration. All ingestion writers must use this RPC;
direct service-role writes are outside the import concurrency contract. The DOI
lookup index is non-unique to preserve any legacy duplicates for explicit repair.
Run `scripts/audit-ingestion.sql` with read-only database access before rollout to
measure duplicate DOI groups, extra rows, and attached stars, progress, highlights,
and cached content. It contains only queries inside a read-only transaction and
rolls back. It is tested against fixtures; it has not been run against production.
Any repair needs an explicit policy for conflicting identifiers and overlapping
user progress/highlights. This PR does not automatically delete or relink them.
A unique DOI index can follow that repair; by itself it does not resolve arXiv/DOI
identifiers pointing at different rows, so the bounded transaction lock remains.

Every deduplicated input returns one outcome: inserted, updated, skipped
(unchanged), or failed.
A failed record rolls back its own changes, while other records in the batch can
succeed. Unexpected transport/RPC responses fail visibly as unconfirmed rather
than claiming success. The client validates a unique in-range `input_index` for
every outcome before counting a batch. Unconfirmed batches retain earlier counts
and do not stop later batches. They may have committed; they are not included in
confirmed failures. Identified records can be retried; identifier-free records
may duplicate on retry. Server logs include RPC causes and batch offsets; SQL
warnings include the failed input index, SQLSTATE, and reason without returning
internal details to the client.

Search and manual refresh show confirmed counts and any unconfirmed count, mark
failures visibly, and invalidate both feed and search after ingestion, including
partial commits. Empty searches have explicit feedback. Cron returns 200 for a
mixed confirmed record result and 500 for unconfirmed batches, total record
failure, a thrown error, or source errors with no confirmed results. Operational
source-health history remains issue #47.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
With local Supabase Docker running, run `node scripts/test-ingestion-db.mjs`.
The database harness creates a disposable database in `supabase_db_paper-deck`,
applies all migrations, tests missing fields, zero, DOI retries, mixed failures,
outcome counts, DOI conflicts/aliases, whitespace, date/author preservation,
service-role writes, the read-only audit, and concurrent independent connections,
then removes only its own database. The disposable database mirrors Supabase's
service-role table grants. Override `TEST_POSTGRES_CONTAINER` for a different
local container. It waits until the first transaction holds the lock and observes
the second session blocked on that advisory lock before releasing the first.
All sessions settle before forced cleanup. Set `TEST_INGESTION_FAIL_CONCURRENT=1`
to exercise the error/cleanup path (a nonzero exit is expected).

Set `TEST_INGESTION_HTTP=1` to also run
`tests/database/ingestion.integration.ts` through the real app caller and
Supabase client against a disposable PostgREST container. This reuses the existing
local REST image, network, and gateway JWTs in memory, creates no credentials, and
binds a temporary `/rest/v1` gateway on loopback. It verifies persisted data,
explicit zero, mixed outcomes, deduplication, anonymous denial, and batch bounds.
The temporary API container and database are removed on success or failure.
These are local integrations; unit tests mock upstream APIs and RPC transport.
