import { ContinueShelf } from "@/components/ContinueShelf";
import { LinkButton } from "@/components/ui";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FEATURES = [
  { title: "One feed, many lenses", body: "Latest, trending, and famous AI/ML papers — deduped across arXiv, Hugging Face, Papers With Code, and Semantic Scholar." },
  { title: "Star to read later", body: "Build a personal library that syncs across your phone and PC." },
  { title: "Resume where you left off", body: "Read in-app and pick up exactly where you stopped — with everything you’ve read highlighted." },
];

export default async function Home() {
  let user = null;
  try {
    user = await currentUser();
  } catch {
    // Supabase not configured yet.
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {user && <ContinueShelf userId={user.id} />}

      <section className="rounded-2xl border border-border bg-card p-8 sm:p-12">
        <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Your AI/ML research, on one deck.
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Track the papers that matter, star what you want to read, and never lose your place again.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href="/feed">Browse papers</LinkButton>
          {!user && (
            <LinkButton href="/login" variant="outline">
              Sign in
            </LinkButton>
          )}
          <LinkButton href="/library" variant="ghost">
            My library
          </LinkButton>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
