import { NextResponse } from "next/server";
import { z } from "zod";

import {
  INTAKE_FAILURE_STATUS,
  saveIntakeAnswers,
} from "@/lib/intake/intake-service";
import {
  consumeRateLimit,
  intakeOriginRule,
  isRateLimited,
  resolveRequestOrigin,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  answers: z.record(z.string(), z.string()),
  submit: z.boolean().optional(),
});

/**
 * The one endpoint in this application that anybody on the internet can reach.
 *
 * The token in the path is the whole authentication, so this route does three
 * things carefully: it rate limits by origin, it never distinguishes a bad
 * token from a stale one, and it returns nothing about the client beyond what
 * they are in the middle of typing.
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
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429 },
      );
    }

    consumeRateLimit(limitKey, intakeOriginRule);

    const { token } = await params;
    const parsed = bodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
    }

    const result = await saveIntakeAnswers({
      token,
      answers: parsed.data.answers,
      submit: parsed.data.submit ?? false,
    });

    if (!("ok" in result) || result.ok !== true) {
      const failure = result as { code: keyof typeof INTAKE_FAILURE_STATUS; message: string; fields?: string[] };

      return NextResponse.json(
        { error: failure.message, fields: failure.fields },
        { status: INTAKE_FAILURE_STATUS[failure.code] },
      );
    }

    return NextResponse.json({
      ok: true,
      submitted: result.submitted,
      percent: result.percent,
      missingRequired: result.missingRequired,
    });
  } catch (error) {
    console.error("[api/intake/:token] Failed to save intake.", error);
    return NextResponse.json(
      { error: "We couldn't save that. Please try again." },
      { status: 500 },
    );
  }
}
