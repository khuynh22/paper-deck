import Link from "next/link";
import { GITHUB_REPO_URL, GitHubIcon } from "@/components/GitHubLink";

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-[720px] flex-col items-center justify-between gap-2 px-4 py-6 font-mono text-[11px] tracking-wide text-faint sm:flex-row sm:px-7">
        <span>© {new Date().getFullYear()} PaperDeck</span>
        <nav className="flex items-center gap-4">
          <Link href="/privacy" className="transition-colors hover:text-accent">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-accent">
            Terms
          </Link>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-accent"
          >
            <GitHubIcon className="h-4 w-4" />
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
