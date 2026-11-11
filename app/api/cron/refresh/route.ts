import { NextResponse, type NextRequest } from "next/server";
import { runRefresh } from "@/lib/corpus/refresh";
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
    const result = await runRefresh("cron");
    const status = result.status === "healthy" ? 200 : result.status === "busy" || result.status === "cooldown" ? 409 : 503;
    return NextResponse.json(result, { status });
  } catch {
    return NextResponse.json(
      { error: "Refresh could not be confirmed. Check owner source health." },
      { status: 500 },
    );
  }
}
