import type { Metadata } from "next";
import Link from "next/link";

const AUTHOR = "Tim Huynh";
const CONTACT_EMAIL = "timhuynhwork@gmail.com";
const GITHUB_URL = "https://github.com/khuynh22/paper-deck";
const EFFECTIVE_DATE = "June 8, 2026";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The simple terms for using PaperDeck.",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Terms of Use</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {EFFECTIVE_DATE}</p>

      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        PaperDeck is a free, open-source project by {AUTHOR}. By using it, you agree to this short,
        common-sense set of terms.
      </p>

      <Section title="What it is">
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          PaperDeck helps you discover and read publicly available AI/ML research papers, pulling
          papers and metadata from sources like arXiv. It&rsquo;s not affiliated with arXiv or with
          the authors and publishers of the papers it links to.
        </p>
      </Section>

      <Section title="Be reasonable">
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Please don&rsquo;t:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          <li>Overload, disrupt, or try to break into the site or its data.</li>
          <li>Scrape or bulk-extract content beyond normal use.</li>
          <li>Use it to break the law or infringe anyone&rsquo;s rights.</li>
        </ul>
      </Section>

      <Section title="The papers aren't mine">
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Papers, abstracts, figures, and metadata belong to their respective authors and publishers
          and come with their own licenses and terms (including arXiv&rsquo;s). PaperDeck just helps
          you read them — how you use any paper is between you and the source, under their terms and
          applicable copyright.
        </p>
      </Section>

      <Section title="No warranty">
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This is a free project I run in my spare time. It&rsquo;s provided &ldquo;as is&rdquo;, with
          no guarantee that it works, stays online, or is accurate. Use it at your own risk — to the
          extent the law allows, I&rsquo;m not liable for any loss that comes from using it.
        </p>
      </Section>

      <Section title="Things change">
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          I may update, pause, or shut down PaperDeck at any time, and I may update these terms (the
          date at the top will change). You can stop using it whenever you like and ask me to delete
          your data — see the{" "}
          <Link href="/privacy" className="text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section title="Open source and contact">
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The source code is{" "}
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
      </Section>
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
