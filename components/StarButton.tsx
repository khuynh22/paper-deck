"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleStar } from "@/app/actions/star";

export function StarButton({
  paperId,
  initialStarred,
}: {
  paperId: string;
  initialStarred: boolean;
}) {
  const [starred, setStarred] = useState(initialStarred);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    const prev = starred;
    setStarred(!prev); // optimistic
    startTransition(async () => {
      try {
        const result = await toggleStar(paperId, prev);
        if (result.ok) {
          setStarred(result.starred);
        } else {
          setStarred(prev); // the write was rejected — undo the optimistic flip
          if (result.error === "auth-required") router.push("/login");
        }
      } catch {
        setStarred(prev); // network/unexpected failure
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={starred}
      aria-label={starred ? "Remove star" : "Star this paper"}
      title={starred ? "Starred" : "Star"}
      className={`grid h-9 w-9 place-items-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        starred
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9 6.2 20.9l1.1-6.47L2.6 9.85l6.5-.95L12 2.5z" />
      </svg>
    </button>
  );
}
