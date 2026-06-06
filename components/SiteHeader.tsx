import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { AuthButton } from "@/components/AuthButton";

export async function SiteHeader() {
  let email: string | null = null;
  try {
    const user = await currentUser();
    email = user?.email ?? null;
  } catch {
    // Supabase not configured yet — render the header without a user.
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
            ƒ
          </span>
          PaperDeck
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/feed" className="rounded-md px-3 py-1.5 hover:bg-muted">
            Feed
          </Link>
          <Link href="/library" className="rounded-md px-3 py-1.5 hover:bg-muted">
            Library
          </Link>
          <div className="ml-2">
            <AuthButton email={email} />
          </div>
        </nav>
      </div>
    </header>
  );
}
