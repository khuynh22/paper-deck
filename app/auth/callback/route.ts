import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

/** OAuth / magic-link callback: exchange the code for a session, then redirect home. */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const requested = searchParams.get("next") ?? "/";
  // Only root-relative paths are valid. Concatenating an unchecked '@host'
  // makes the application origin URL user-info and redirects to that host.
  const next = requested.startsWith("/") && !requested.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(requested) ? requested : "/";

  if (code) {
    const db = await serverClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
