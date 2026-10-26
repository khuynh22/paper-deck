"use client";

import { useState, useTransition } from "react";
import { triggerRefresh } from "@/app/actions/refresh";
import { Button } from "@/components/ui";
import { formatIngestion } from "@/lib/corpus/ingestion";

export function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  function onClick() {
    setMsg(null);
    setFailed(false);
    startTransition(async () => {
      try {
        const r = await triggerRefresh();
        const errs = r.errors.length ? ` · ${r.errors.length} source error(s)` : "";
        const c = r.ingestion;
        setMsg(formatIngestion(c) + errs);
        setFailed(c.failed > 0 || c.unconfirmed > 0 || r.errors.length > 0);
      } catch {
        setMsg("Refresh failed");
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span role={failed ? "alert" : "status"} className={`text-xs ${failed ? "text-danger" : "text-muted-foreground"}`}>{msg}</span>}
      <Button variant="outline" disabled={pending} onClick={onClick}>
        {pending ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  );
}
