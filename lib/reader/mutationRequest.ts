import { z } from "zod";
import { highlightInputSchema, NOTE_MAX } from "@/lib/db/highlightRow";

const fraction = z.number().min(0).max(1);
const progressUpdateSchema = z.object({
  scrollPct: fraction.optional(),
  blockAnchor: z.string().nullable().optional(),
  markedAnchor: z.string().nullable().optional(),
  readPct: fraction.optional(),
  markedPct: fraction.optional(),
  readerKind: z.enum(["html", "pdf"]).optional(),
  status: z.enum(["to_read", "reading", "done"]).optional(),
});

export const readerMutationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("progress"), paperId: z.uuid(), update: progressUpdateSchema }),
  z.object({ operation: z.literal("highlight"), input: highlightInputSchema.and(z.object({ paperId: z.uuid() })), requestId: z.uuid() }),
  z.object({ operation: z.literal("note"), id: z.uuid(), note: z.string().max(NOTE_MAX).nullable() }),
  z.object({ operation: z.literal("delete"), id: z.uuid() }),
]);

export type ReaderMutation = z.infer<typeof readerMutationSchema>;
