"use client";

import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/db/browser";
import { Button, LinkButton } from "@/components/ui";

export function AuthButton({ email }: { email: string | null }) {
  const router = useRouter();

  if (!email) {
    return (
      <LinkButton href="/login" variant="outline">
        Sign in
      </LinkButton>
    );
  }

  async function signOut() {
    await browserClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-muted-foreground sm:inline" title={email}>
        {email}
      </span>
      <Button variant="ghost" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
