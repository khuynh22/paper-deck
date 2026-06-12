"use client";

import { useState } from "react";
import { browserClient } from "@/lib/db/browser";
import { BrandMark } from "@/components/BrandMark";

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
    <div className="pd-enter flex min-h-[calc(100vh-58px)] items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-[350px] flex-col items-center text-center">
        <BrandMark className="h-[43px] w-[38px]" />

        <h1 className="mt-5 font-serif text-[28px] font-medium tracking-tight">Welcome back</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground text-pretty">
          Your saved papers and reading progress, synced across every device.
        </p>

        <button
          type="button"
          onClick={signInWithGoogle}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-line bg-card text-sm font-medium text-ink transition-colors hover:border-accent"
        >
          <svg viewBox="0 0 18 18" className="h-[16px] w-[16px]" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
            />
          </svg>
          Continue with Google
        </button>

        <div className="my-5 flex w-full items-center gap-3 font-mono text-[11px] text-faint">
          <div className="h-px flex-1 bg-hairline" /> or <div className="h-px flex-1 bg-hairline" />
        </div>

        {sent ? (
          <p className="w-full rounded-xl border border-line bg-card p-3.5 text-sm leading-relaxed text-muted-foreground">
            Check your inbox — we sent a magic sign-in link to{" "}
            <strong className="text-ink">{email}</strong>.
          </p>
        ) : (
          <form onSubmit={signInWithEmail} className="w-full space-y-2.5">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 w-full rounded-full border border-line bg-card px-4 text-center text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus-visible:ring-[3px] focus-visible:ring-accent-soft"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-full border border-line text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? "Sending…" : "Email me a magic link"}
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <p className="mt-5 text-xs leading-normal text-faint">
          By continuing you agree to the Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
