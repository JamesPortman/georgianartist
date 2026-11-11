import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Which commit is serving this request. The post-deploy smoke test
 * (.github/workflows/smoke.yml) polls it until the commit Vercel just deployed
 * is the one answering on the live domain — a deploy that failed keeps serving
 * the previous build with every page still 200, and this is how that shows.
 *
 * The repository is private, so a commit hash tells a visitor nothing useful.
 * Null outside Vercel.
 */
export function GET() {
  return NextResponse.json(
    { commit: process.env.VERCEL_GIT_COMMIT_SHA || null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
