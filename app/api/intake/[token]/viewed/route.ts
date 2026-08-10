import { NextResponse } from "next/server";

import { markIntakeViewed } from "@/lib/intake/intake-service";
import {
  consumeRateLimit,
  intakeOriginRule,
  isRateLimited,
  resolveRequestOrigin,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Records that the client opened their form.
 *
 * Its own endpoint because the page that shows the form must stay pure - a
 * server component that writes during render can run twice, which would make
 * "opened at" a guess. Always answers 204 whatever happened: whether a given
 * token exists is not something this route will confirm to a stranger.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const origin = resolveRequestOrigin({
      "x-forwarded-for": request.headers.get("x-forwarded-for") ?? undefined,
      "x-real-ip": request.headers.get("x-real-ip") ?? undefined,
    });

    const limitKey = `intake:${origin}`;

    if (!isRateLimited(limitKey, intakeOriginRule).allowed) {
      return new NextResponse(null, { status: 429 });
    }

    consumeRateLimit(limitKey, intakeOriginRule);

    const { token } = await params;
    await markIntakeViewed(token);
  } catch (error) {
    // Recording a view is never worth failing the page over.
    console.error("[api/intake/:token/viewed] Failed to record view.", error);
  }

  return new NextResponse(null, { status: 204 });
}
