"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleStar } from "@/app/actions/star";

function StarIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    >
      <path d="M12 2.8l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.7l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z" />
    </svg>
  );
}

/**
 * "Save" toggle (a star under the hood). `variant="row"` is the quiet pill in
 * list rows; `variant="detail"` is the outlined button on the paper page.
 */
export function StarButton({
  paperId,
  initialStarred,
  variant = "row",
}: {
  paperId: string;
  initialStarred: boolean;
  variant?: "row" | "detail";
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

  const label =
    variant === "detail" ? (starred ? "Saved" : "Save to library") : starred ? "Saved" : "Save";

  const className =
    variant === "detail"
      ? `flex h-[42px] items-center gap-2 rounded-full border border-line px-4.5 text-[13.5px] font-medium transition-colors hover:border-accent ${
          starred ? "text-accent" : "text-ink"
        }`
      : `flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-tint ${
          starred ? "text-accent" : "text-muted-foreground"
        }`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={starred}
      aria-label={starred ? "Remove from library" : "Save to library"}
      title={starred ? "Saved" : "Save"}
      className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50`}
    >
      <StarIcon filled={starred} size={variant === "detail" ? 14 : 13} />
      {label}
    </button>
  );
}
