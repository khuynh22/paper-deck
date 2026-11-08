"use client";

import { z } from "zod";
import { highlightInputSchema, type HighlightInput } from "@/lib/db/highlightRow";
import type { ProgressUpdate } from "@/lib/db/progressRow";
import { mutationFailure, type MutationResult } from "@/lib/mutationResult";
import type { Highlight } from "@/lib/types";
import type { ReaderMutation } from "./mutationRequest";

const failureSchema = z.object({
  ok: z.literal(false),
  code: z.enum(["auth", "storage", "validation", "not_found"]),
  message: z.string(),
});
const acknowledgementSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown().optional() }),
  failureSchema,
]);
const savedHighlightSchema = highlightInputSchema.and(z.object({
  id: z.uuid(), paperId: z.uuid(), note: z.string().nullable(),
}));

async function write<T>(mutation: ReaderMutation, dataSchema: z.ZodType<T>): Promise<MutationResult<T>> {
  try {
    const response = await fetch("/api/reader/mutations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      keepalive: true,
      body: JSON.stringify(mutation),
    });
    if (!response.ok) return mutationFailure({ status: response.status });
    const acknowledgement = acknowledgementSchema.safeParse(await response.json());
    if (!acknowledgement.success) return mutationFailure();
    if (!acknowledgement.data.ok) return acknowledgement.data;
    const data = dataSchema.safeParse(acknowledgement.data.data);
    return data.success ? { ok: true, data: data.data } : mutationFailure();
  } catch (error) {
    return mutationFailure(error);
  }
}

export function saveProgress(paperId: string, update: ProgressUpdate): Promise<MutationResult> {
  return write({ operation: "progress", paperId, update }, z.undefined());
}

export function createHighlight(input: HighlightInput, requestId: string): Promise<MutationResult<Highlight>> {
  return write({ operation: "highlight", input, requestId }, savedHighlightSchema);
}

export function updateHighlightNote(id: string, note: string | null): Promise<MutationResult> {
  return write({ operation: "note", id, note }, z.undefined());
}

export function deleteHighlight(id: string): Promise<MutationResult> {
  return write({ operation: "delete", id }, z.undefined());
}
