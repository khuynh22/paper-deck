import { NextResponse, type NextRequest } from "next/server";
import { aggregate } from "@/lib/sources";
import { upsertPapers } from "@/lib/corpus/upsert";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. */
function authorized(req: NextRequest): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false; // refuse until a secret is configured
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { results, errors } = await aggregate();
    const upserted = await upsertPapers(results);
    return NextResponse.json({ upserted, errors });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
