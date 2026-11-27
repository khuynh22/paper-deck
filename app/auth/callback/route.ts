import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

/** OAuth / magic-link callback: exchange the code for a session, then redirect home. */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const db = await serverClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
