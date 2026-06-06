"use client";

import { useState } from "react";
import { browserClient } from "@/lib/db/browser";
import { Button, Card } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Read ?next= from the URL (without useSearchParams, to avoid a Suspense boundary)
  // and thread it through the callback so users return to where they were headed.
  function buildRedirectTo(): string | undefined {
    if (typeof window === "undefined") return undefined;
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function signInWithGoogle() {
    setError(null);
    const { error } = await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: buildRedirectTo() },
    });
    if (error) setError(error.message);
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await browserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: buildRedirectTo() },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16">
      <Card className="w-full p-6">
        <h1 className="text-xl font-semibold">Sign in to PaperDeck</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sync your stars and reading progress across devices.
        </p>

        <Button variant="outline" className="mt-6 w-full" onClick={signInWithGoogle}>
          Continue with Google
        </Button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
        </div>

        {sent ? (
          <p className="rounded-lg bg-muted p-3 text-sm">
            Check your inbox — we sent a magic sign-in link to <strong>{email}</strong>.
          </p>
        ) : (
          <form onSubmit={signInWithEmail} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Email me a magic link"}
            </Button>
          </form>
        )}

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      </Card>
    </div>
  );
}
