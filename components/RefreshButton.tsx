"use client";

import { useState, useTransition } from "react";
import { triggerRefresh } from "@/app/actions/refresh";
import { Button } from "@/components/ui";

export function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await triggerRefresh();
        if (r.status === "busy" || r.status === "cooldown") {
          setMsg(r.status === "busy" ? "A refresh is already running." : "Please wait five minutes between manual refreshes.");
          return;
        }
        const errs = r.errors.length ? ` · ${r.errors.length} source error(s)` : "";
        const c = r.ingestion;
        setMsg(`${r.status}: ${c.inserted} added, ${c.updated} updated, ${c.skipped} unchanged or skipped, ${c.failed} failed${errs}`);
      } catch {
        setMsg("Refresh failed");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span role="status" className="text-xs text-muted-foreground">{msg}</span>}
      <Button variant="outline" disabled={pending} onClick={onClick}>
        {pending ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  );
}
