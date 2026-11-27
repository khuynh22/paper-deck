"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchArxivAction } from "@/app/actions/search";
import { Button } from "@/components/ui";
import { formatIngestion } from "@/lib/corpus/ingestion";

/**
 * "Search arXiv for more" — pulls fresh matches into the corpus, then refreshes
 * the server page so the new papers appear in the single ranked list above.
 */
export function ExternalSearch({ query }: { query: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  function onClick() {
    setMsg(null);
    setFailed(false);
    startTransition(async () => {
      try {
        const r = await searchArxivAction(query);
        if (r.error) {
          setMsg(r.error);
          setFailed(true);
          return;
        }
        const counts = r.ingestion;
        setMsg(counts ? formatIngestion(counts, "No new arXiv results.") : "No new arXiv results.");
        setFailed(!!counts && (counts.failed > 0 || counts.unconfirmed > 0));
        router.refresh();
      } catch {
        setMsg("arXiv search failed. Please retry.");
        setFailed(true);
      }
    });
  }

  return (
    <div className="mt-8 flex flex-col items-center gap-2 border-t border-hairline pt-6 text-center">
      <p className="text-sm text-muted-foreground">Not finding it? Pull fresh matches from arXiv.</p>
      <Button variant="outline" disabled={pending} onClick={onClick}>
        {pending ? "Searching arXiv…" : "Search arXiv for more"}
      </Button>
      {msg && <span role={failed ? "alert" : "status"} className={`text-xs ${failed ? "text-danger" : "text-muted-foreground"}`}>{msg}</span>}
    </div>
  );
}
