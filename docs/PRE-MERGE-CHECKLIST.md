# PR 57 manual checks

Use a local or restricted preview app backed by a disposable/staging Supabase
database with all migrations applied. Use existing test accounts and locally
configured Supabase URL/anon key/server service-role key; provider API keys are
needed only for enabled sources. Never point destructive fixtures or failure
injection at production. Unit tests mock providers and action boundaries; the DB
and HTTP harnesses verify actual local SQL/PostgREST behavior.

| Setup / action | Expected result | Blocker |
| --- | --- | --- |
| Rehearse pending migrations on a restricted copy; run `scripts/audit-ingestion.sql` first. Record UUIDs and state counts for a compatible duplicate DOI. | One canonical row, valid normalized unique index, old UUID mapping, both users' stars, exact progress, highlight IDs/notes/cache preserved. Any unsafe group aborts the entire migration with DOI/reason. | Silent data selection/loss, unexpected FK, unsafe group or lock budget unresolved. |
| Open `/paper/<old-uuid>`, `/reader/<old-uuid>` signed in, and `/api/reader/<old-uuid>?pdf=1` where PDF exists. | Canonical URLs; correct content and `?pdf=1` retained. | 404, redirect loop, wrong paper/PDF or changed anchors. |
| Keep a staging reader tab open before migration, complete maintenance migration/app switch, then save progress, star/unstar and retry a pending highlight. | Writes use canonical paper, same highlight ID and edited note survive; no orphan/stale-ID error. | Lost note/position, duplicate highlight, acknowledged failed write. |
| Search `/search?q=1706.03762`; use **Search arXiv for more** twice, then owner **Refresh** on `/`. Compare paper UUID and metadata in the staging DB. | One identified paper; repeat counts match stored changes; DOI/arXiv aliases converge; absent signals, long authors and precise dates survive. Explicit observed zero persists. | Duplicate normalized DOI, wrong identity, lost metadata or misleading counts. Provider calls require network; source outage must show failure. |
| In a disposable fixture, submit one invalid paper alongside one valid paper; retry the identified valid input. Disconnect the local RPC for a later batch. | Valid input commits, invalid input is failed, repeat is updated/skipped; transport uncertainty is shown as unconfirmed, previous confirmed counts remain and feed/search refresh. | All-or-nothing loss, false success, swallowed error or duplicate identified paper. Prefer the harness for deterministic failure injection. |
| From `/`, save a paper to Library; unstar/re-star and reload `/library`. Open both HTML and PDF readers. Scroll, use **I finished here**, reload, clear the mark. | Library/Continue reading and exact resume/mark agree with the reader; HTML anchors/PDF page remain stable. | Lost save, wrong resume/mark or incorrect success feedback. |
| HTML reader: select a passage, highlight, add/edit note, reload, delete, reload. Repeat save with browser network offline, restore network and Retry. | Pending/failed states are visible; confirmed note persists; retry does not duplicate or overwrite a newer note. | Silent failure, lost/duplicated notes or stale deletion state. |
| Sign in as a second existing test account, then sign out. Open the canonical and old UUIDs. | Public corpus/redirect only; other user's stars/progress/notes remain private; signed-out mutations require login. | Any cross-user state exposure or unauthorized write. |

Read-only production checks: confirm migration versions, run the audit with a
read-only connection, inspect exact-head CI/review status and verify backup/restore
readiness. Do not run fixtures, cleanup, user creation or migration tests there.

Deployment is a separate operator action: backup and rehearse; pause/drain **all**
writers; apply 0009 plus the corrective migration; verify data/index/permissions;
deploy and drain old app workers; check old URLs and saves; then reopen traffic.
See [INGESTION.md](INGESTION.md) for rollback restrictions. Any unresolved unsafe
group needs an explicit data policy before deployment, even if CI is green.

Repository gates remain: required CI checks, all actionable review threads resolved,
and required human/code-owner approval. No approval or merge is supplied by this PR.
