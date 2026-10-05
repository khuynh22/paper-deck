# Paper import semantics

Imports use the service-role-only `merge_papers` RPC introduced in migration
`0009_merge_papers.sql`. Apply the migration before releasing these callers.
Anonymous and authenticated API clients cannot invoke the import RPC.

Each nonempty supplied metadata value replaces the corresponding stored value.
Null, undefined, empty text, and empty author/category arrays mean unknown and
preserve existing metadata. Imports cannot explicitly clear those fields.
Supplied numeric signals, including zero, replace older values; absent signals
preserve them. New records use database defaults for absent fields. Adapters must
not turn absent upstream signals into zero. Within an import, records are applied
in input order; across imports, the database lock determines order.

Identity uses arXiv ID or trimmed, case-insensitive DOI. A DOI-only paper can later
gain its arXiv ID. If supplied identifiers refer to different existing papers, or
a legacy DOI has multiple matches, that input fails without deleting, relinking,
or merging existing papers and their associated user data. Papers without either
identifier can still be inserted, but cannot be reliably deduplicated on retry;
titles alone are not treated as proof of identity.

The RPC serializes import transactions with an advisory lock and locks matching
rows before merging. It reads current fields inside the transaction, so concurrent
partial imports retain independently supplied metadata. Each batch contains at
most 100 records to bound lock duration. All ingestion writers must use this RPC;
direct service-role writes are outside the import concurrency contract. The DOI
lookup index is non-unique to preserve any legacy duplicates for explicit repair.

Every input returns one outcome: inserted, updated, skipped (unchanged), or failed.
A failed record rolls back its own changes, while other records in the batch can
succeed. Unexpected transport/RPC responses fail visibly as unconfirmed rather
than claiming success; already committed identified records can safely be retried.
Search and manual refresh show all four counts; cron exposes them and uses HTTP
500 if any records fail. Operational source-health history remains issue #47.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
With local Supabase Docker running, run `node scripts/test-ingestion-db.mjs`.
The database harness creates a disposable database in `supabase_db_paper-deck`,
applies all migrations, tests missing fields, zero, DOI retries, mixed failures,
permission boundaries, and concurrent independent connections, then removes only
its own database. Override `TEST_POSTGRES_CONTAINER` for a different local container.
