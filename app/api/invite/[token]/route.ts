import { NextResponse } from "next/server";
import { z } from "zod";

import { consumeRateLimit, isRateLimited, resolveRequestOrigin } from "@/lib/rate-limit";
import { acceptInvite } from "@/lib/team/invites";

export const runtime = "nodejs";

/*
 * Public, like the intake form: somebody without an account uses it. So it is
 * rate-limited per origin - ten attempts in fifteen minutes is plenty for a
 * person typing a password twice and far too few to guess a token.
 */
const inviteRule = { limit: 10, windowMs: 15 * 60 * 1000 };

const schema = z.object({ password: z.string().min(8).max(200) });

/** Sets the invited member's password and spends the link. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const origin = resolveRequestOrigin({
    "x-forwarded-for": request.headers.get("x-forwarded-for") ?? undefined,
    "x-real-ip": request.headers.get("x-real-ip") ?? undefined,
  });
  const limitKey = `invite:${origin}`;

  if (!isRateLimited(limitKey, inviteRule).allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      { status: 429 },
    );
  }

  consumeRateLimit(limitKey, inviteRule);

  const { token } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a password of at least 8 characters." }, { status: 400 });
  }

  const result = await acceptInvite(token, parsed.data.password);

  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });

  return NextResponse.json({ ok: true, email: result.email });
}
