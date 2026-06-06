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
        const errs = r.errors.length ? ` · ${r.errors.length} source error(s)` : "";
        setMsg(`+${r.upserted} papers${errs}`);
      } catch {
        setMsg("Refresh failed");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <Button variant="outline" disabled={pending} onClick={onClick}>
        {pending ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  );
}
