import type { Metadata } from "next";
import Link from "next/link";

const AUTHOR = "Tim Huynh";
const CONTACT_EMAIL = "timhuynhwork@gmail.com";
const GITHUB_URL = "https://github.com/khuynh22/paper-deck";
const EFFECTIVE_DATE = "June 8, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What data PaperDeck stores and why.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {EFFECTIVE_DATE}</p>

      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        PaperDeck is a free, open-source project built and run by {AUTHOR}. It&rsquo;s a reader for
        publicly available AI/ML research papers — you can browse them, save them to a library, and
        read them in-app with your place remembered. This page explains, in plain terms, what data
        the app stores and why. The full source code is{" "}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-2"
        >
          on GitHub
        </a>
        . Questions? Email me at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-2">
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <Section title="What PaperDeck stores">
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          <li>
            <strong className="text-foreground">Your account.</strong> If you sign in with Google,
            the app receives your name, email address, and profile picture. If you use an email
            magic link instead, it&rsquo;s just your email address. Sign-in and account records are
            handled by Supabase.
          </li>
          <li>
            <strong className="text-foreground">Your activity.</strong> The papers you save
            (&ldquo;stars&rdquo;) and your reading progress for each paper — scroll position,
            last-read and highlighted spots, reader type, and a status (to-read, reading, done).
          </li>
          <li>
            <strong className="text-foreground">Basic technical data.</strong> The host (Vercel)
            processes standard request info like IP address, browser type, and timestamps to serve
            and protect the site. One essential cookie keeps you signed in.
          </li>
        </ul>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          That&rsquo;s it. No payment info, no ads, and no third-party analytics or tracking cookies.
        </p>
      </Section>

      <Section title="How papers load">
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Paper text is fetched and cleaned up by the server from sources like arXiv and ar5iv. The
          figures and images inside a paper, though, load straight from those sources in your browser
          when you open the reader — so, like any external image on the web, those servers may see
          your IP address. Your PaperDeck account isn&rsquo;t shared with them.
        </p>
      </Section>

      <Section title="Who else touches your data">
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          I don&rsquo;t sell your data. It&rsquo;s only handled by the services that keep PaperDeck
          running:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          <li>
            <strong className="text-foreground">Supabase</strong> — database and sign-in; stores your
            account and activity.
          </li>
          <li>
            <strong className="text-foreground">Google</strong> — only if you choose &ldquo;Continue
            with Google&rdquo;, as your sign-in provider.
          </li>
          <li>
            <strong className="text-foreground">Vercel</strong> — hosting; serves the app and keeps
            request logs.
          </li>
        </ul>
      </Section>

      <Section title="Deleting your data">
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Email me at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>{" "}
          any time and I&rsquo;ll delete your account along with your saved papers and reading
          progress. You can also ask for a copy of what&rsquo;s stored about you.
        </p>
      </Section>

      <Section title="Security">
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Everything is served over HTTPS, and per-user data is protected with row-level security so
          each account can only reach its own records.
        </p>
      </Section>

      <Section title="A few more things">
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          <li>PaperDeck isn&rsquo;t aimed at children under 13, and I don&rsquo;t knowingly collect their data.</li>
          <li>The services above may store data in the United States and other countries.</li>
          <li>
            If this policy changes, I&rsquo;ll update the date at the top. Material changes will be
            called out where reasonable.
          </li>
        </ul>
      </Section>

      <p className="mt-10 text-sm leading-6 text-muted-foreground">
        See also the{" "}
        <Link href="/terms" className="text-foreground underline underline-offset-2">
          Terms of Use
        </Link>
        .
      </p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mt-8 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
