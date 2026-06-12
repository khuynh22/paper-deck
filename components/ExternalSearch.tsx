"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchArxivAction } from "@/app/actions/search";
import { Button } from "@/components/ui";

/**
 * "Search arXiv for more" — pulls fresh matches into the corpus, then refreshes
 * the server page so the new papers appear in the single ranked list above.
 */
export function ExternalSearch({ query }: { query: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      const r = await searchArxivAction(query);
      if (r.error) {
        setMsg(r.error);
        return;
      }
      setMsg(r.added > 0 ? `Merged ${r.added} arXiv result(s).` : "No new arXiv results.");
      router.refresh();
    });
  }

  return (
    <div className="mt-8 flex flex-col items-center gap-2 border-t border-hairline pt-6 text-center">
      <p className="text-sm text-muted-foreground">Not finding it? Pull fresh matches from arXiv.</p>
      <Button variant="outline" disabled={pending} onClick={onClick}>
        {pending ? "Searching arXiv…" : "Search arXiv for more"}
      </Button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
