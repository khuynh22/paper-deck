# Contributing to PaperDeck

Thanks for your interest! PRs, bug reports, and new paper-source adapters are all welcome.

## Quick start

Prerequisites: **Node 20+**, **pnpm 10** (`corepack enable` picks the right version from
`package.json`), and **Docker** (for local Supabase).

```bash
git clone https://github.com/khuynh22/paper-deck.git
cd paper-deck
pnpm install

# Start local Supabase (applies migrations in supabase/migrations)
npx supabase start

# Configure env — copy the keys printed by `supabase status` into .env.local
cp .env.example .env.local

# Run the app
pnpm dev
```

See the [README](README.md#local-development) for details on seeding the paper corpus.

## Before you open a PR

Run the full check suite locally — CI runs the same commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Guidelines:

- **Keep PRs focused.** One change per PR; small PRs get reviewed fast.
- **Add tests** for changes to `lib/sources/`, `lib/corpus/`, and `lib/reader/sanitize` —
  these are the highest-risk areas (external data in, HTML rendered to users out).
- **Discuss big changes first.** Open an issue or discussion before building large
  features so we can agree on direction.
- **Note for AI-assisted contributions:** this repo pins a Next.js version that may be
  newer than your model's training data — see `AGENTS.md`. Check
  `node_modules/next/dist/docs/` for the current APIs.

## Adding a new paper source

The most-wanted contribution! Each source is one adapter in `lib/sources/` that returns
`NormalizedPaper[]`:

1. Add `lib/sources/<your-source>.ts` exporting a fetch function that maps the upstream
   API to `NormalizedPaper` (see existing adapters like the arXiv or Hugging Face one).
2. Papers are deduplicated across sources by arXiv ID in `lib/corpus/` — populate
   `arxivId` whenever the source exposes it.
3. Register the source in the refresh pipeline and gate it behind an env var if it
   needs an API key (add the key to `.env.example`, never commit real keys).
4. Add a test in `tests/sources/` using a recorded fixture (see `tests/fixtures/`) —
   tests must not hit live APIs.

## Reporting bugs & security issues

- Bugs: use the [bug report template](https://github.com/khuynh22/paper-deck/issues/new/choose).
- Security vulnerabilities: **do not open a public issue** — see [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
