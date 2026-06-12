import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { AuthButton } from "@/components/AuthButton";
import { BrandMark } from "@/components/BrandMark";
import { GitHubLink } from "@/components/GitHubLink";
import { HeaderNav } from "@/components/HeaderNav";
import { SearchBar } from "@/components/SearchBar";
import { ThemeToggle } from "@/components/ThemeToggle";

export async function SiteHeader() {
  let email: string | null = null;
  try {
    const user = await currentUser();
    email = user?.email ?? null;
  } catch {
    // Supabase not configured yet — render the header without a user.
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-[58px] max-w-[1060px] items-center gap-2 px-4 sm:px-7">
        <Link href="/" className="mr-2.5 flex items-center gap-2.5 text-ink">
          <BrandMark className="h-[27px] w-6" />
          <span className="font-serif text-[19.5px] font-semibold tracking-tight">PaperDeck</span>
        </Link>

        <HeaderNav />

        <span className="flex-1" />

        <SearchBar className="hidden w-[200px] md:block" />

        <Link
          href="/search"
          title="Search"
          aria-label="Search"
          className="hidden h-[34px] w-[34px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-tint hover:text-ink sm:flex md:hidden"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.8" y1="16.8" x2="21" y2="21" />
          </svg>
        </Link>

        <GitHubLink className="hidden sm:flex" />

        <ThemeToggle />

        <div className="ml-0.5">
          <AuthButton email={email} />
        </div>
      </div>
    </header>
  );
}
