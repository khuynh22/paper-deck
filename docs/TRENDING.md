# Trending ranking and paging

Trending scores the full public corpus before selecting a page.

`(3 * hf_upvotes + 5 * ln(1 + pwc_stars)) * (0.3 + exp(-age_days / 14))`

Future publications use an age of zero. Missing and non-finite publication dates
use 3,650 days. Negative legacy signal counts contribute zero. PostgreSQL caps
age at 10,000 days to avoid exponential underflow. At that age, adding the decay
term to 0.3 already rounds to 0.3 in double precision.

Trending sorts by descending score and ascending paper ID. `getFeed` accepts a
limit of 1–100 and an offset of 0–100,000. Pass the same ISO timestamp as `asOf`
on each page to freeze time decay. Imports and signal updates can still change
page membership. Latest and Famous use ascending paper ID to break ties.

Apply `20261114204352_trending_ranking.sql` before deploying the app that calls
`trending_papers`. The migration adds a read-only function and grants it access
through the existing public papers policy. The previous app can run with the
function in place.

`node scripts/test-ranking-db.mjs` runs against a disposable database inside the
local PostgreSQL container named by `TEST_POSTGRES_CONTAINER`. It reproduces the
old top-40 exclusion, compares every result with the TypeScript score, verifies
frozen paging under the public API role, and prints a query plan for a synthetic
50,000-paper corpus.
