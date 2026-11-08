import { NextRequest, NextResponse } from "next/server";
import { saveProgress } from "@/app/actions/progress";
import { createHighlight, deleteHighlight, updateHighlightNote } from "@/app/actions/highlights";
import { readerMutationSchema } from "@/lib/reader/mutationRequest";
import { mutationFailure, type MutationResult } from "@/lib/mutationResult";

const MAX_REQUEST_BYTES = 16_384;

function reply(result: MutationResult<unknown>, status = 200) {
  return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return reply({ ok: false, code: "validation", message: "Save from the reader page and try again." }, 403);
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return reply({ ok: false, code: "validation", message: "Invalid save request." }, 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    return reply({ ok: false, code: "validation", message: "Save request is too large." }, 413);
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_REQUEST_BYTES) {
      return reply({ ok: false, code: "validation", message: "Save request is too large." }, 413);
    }
    body = JSON.parse(text);
  } catch {
    return reply({ ok: false, code: "validation", message: "Invalid save request." }, 400);
  }
  const mutation = readerMutationSchema.safeParse(body);
  if (!mutation.success) {
    return reply({ ok: false, code: "validation", message: "Invalid save request." }, 400);
  }

  try {
    const input = mutation.data;
    let result: MutationResult<unknown>;
    switch (input.operation) {
      case "progress": result = await saveProgress(input.paperId, input.update); break;
      case "highlight": result = await createHighlight(input.input, input.requestId); break;
      case "note": result = await updateHighlightNote(input.id, input.note); break;
      case "delete": result = await deleteHighlight(input.id); break;
    }
    return reply(result, !result.ok && result.code === "auth" ? 401 : 200);
  } catch (error) {
    return reply(mutationFailure(error), 500);
  }
}
