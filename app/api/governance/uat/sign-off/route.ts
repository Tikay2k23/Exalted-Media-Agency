import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { UAT_FAILURE_STATUS, approveLimitedBeta } from "@/lib/governance/uat-service";

export const runtime = "nodejs";

/**
 * Signing off Limited Beta.
 *
 * The readiness is recomputed here rather than trusted from the request. The
 * button can only ever be as current as its last render, and this is the one
 * decision where a stale screen must not be able to ship something.
 */
export async function POST() {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await approveLimitedBeta({ actor });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.message,
          /* The exact reasons, so the refusal is actionable. */
          blockers: "blockers" in result ? result.blockers : undefined,
        },
        { status: UAT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, cases: result.cases });
  } catch (error) {
    console.error("[api/governance/uat/sign-off] Failed.", error);
    return NextResponse.json({ error: "Unable to sign off right now." }, { status: 500 });
  }
}
