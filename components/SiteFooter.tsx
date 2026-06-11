import Link from "next/link";
import { GITHUB_REPO_URL, GitHubIcon } from "@/components/GitHubLink";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
        <span>© {new Date().getFullYear()} PaperDeck</span>
        <nav className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground"
          >
            <GitHubIcon className="h-4 w-4" />
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
