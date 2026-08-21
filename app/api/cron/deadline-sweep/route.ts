import { NextResponse } from "next/server";

import { runDeadlineSweep } from "@/lib/tasks/deadline-sweep";

export const runtime = "nodejs";
// Nothing about a sweep can be cached, and a cached 200 would silently mean it
// never ran.
export const dynamic = "force-dynamic";

/**
 * The scheduled deadline sweep.
 *
 * Vercel calls this on the schedule in vercel.json, sending
 * `Authorization: Bearer $CRON_SECRET`. The endpoint is on the public internet
 * either way, and it writes notifications to real people, so an unauthenticated
 * caller must not be able to trigger it.
 *
 * Refuses to run at all when CRON_SECRET is unset rather than falling open.
 * The failure mode of a missing secret should be a sweep that does not happen
 * and says so, not an open endpoint that anybody can use to fill somebody's
 * notification list.
 */
function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return { ok: false, status: 503, error: "CRON_SECRET is not configured." };
  }

  const provided = request.headers.get("authorization");

  if (provided !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  return { ok: true as const, status: 200, error: null };
}

export async function GET(request: Request) {
  const auth = authorize(request);

  if (!auth.ok) {
    // Logged because a cron that is quietly 401ing every night looks exactly
    // like a cron that is working.
    console.error("[cron/deadline-sweep] Refused a request.", { status: auth.status });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const started = Date.now();
    const result = await runDeadlineSweep();

    console.info("[cron/deadline-sweep] Completed.", {
      ...result,
      ms: Date.now() - started,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/deadline-sweep] Failed.", error);
    return NextResponse.json({ error: "The sweep failed." }, { status: 500 });
  }
}
