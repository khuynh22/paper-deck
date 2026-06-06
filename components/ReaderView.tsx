"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { HtmlReader } from "@/components/HtmlReader";
import { LinkButton } from "@/components/ui";
import type { ProgressRow } from "@/lib/types";

const PdfReader = dynamic(() => import("@/components/PdfReader").then((m) => m.PdfReader), {
  ssr: false,
  loading: () => <ReaderSkeleton />,
});

type Payload =
  | { kind: "html"; html: string; pdfUrl: string | null; title: string }
  | { kind: "pdf"; pdfUrl: string; title: string }
  | { kind: "none"; sourceUrl: string | null; pdfUrl: string | null; title: string }
  | { error: string };

function ReaderSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse px-4 py-10">
      <div className="h-6 w-2/3 rounded bg-muted" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-4 w-full rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}

export function ReaderView({
  paperId,
  initialProgress,
}: {
  paperId: string;
  initialProgress: ProgressRow | null;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reader/${paperId}`)
      .then((r) => r.json())
      .then((d: Payload) => {
        if (!cancelled) setPayload(d);
      })
      .catch(() => {
        if (!cancelled) setPayload({ error: "Failed to load." });
      });
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  if (!payload) return <ReaderSkeleton />;

  if ("error" in payload) {
    return <p className="px-4 py-20 text-center text-sm text-muted-foreground">{payload.error}</p>;
  }

  if (payload.kind === "html") {
    return <HtmlReader paperId={paperId} html={payload.html} initialProgress={initialProgress} />;
  }

  if (payload.kind === "pdf") {
    return <PdfReader paperId={paperId} initialProgress={initialProgress} />;
  }

  // kind === "none" — no in-app rendering available.
  const target = payload.sourceUrl ?? payload.pdfUrl;
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="font-medium">No in-app version available</p>
      <p className="mt-1 text-sm text-muted-foreground">
        This paper doesn’t have an HTML or PDF we can render in the reader.
      </p>
      {target && (
        <LinkButton href={target} target="_blank" rel="noreferrer" className="mt-6">
          Open on arXiv
        </LinkButton>
      )}
    </div>
  );
}
