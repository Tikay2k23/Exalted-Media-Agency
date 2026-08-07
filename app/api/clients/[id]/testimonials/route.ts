import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { ADVOCACY_FAILURE_STATUS, saveTestimonial } from "@/lib/growth/advocacy-service";
import { testimonialSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerAuthSession();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = testimonialSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid testimonial details" }, { status: 400 });
    }

    const result = await saveTestimonial({
      actor,
      clientId: id,
      testimonialId: parsed.data.testimonialId,
      format: parsed.data.format,
      status: parsed.data.status,
      trigger: parsed.data.trigger,
      content: parsed.data.content,
      mediaUrl: parsed.data.mediaUrl,
      publishingChannels: parsed.data.publishingChannels,
      allowPersonName: parsed.data.allowPersonName,
      allowBusinessName: parsed.data.allowBusinessName,
      allowLogo: parsed.data.allowLogo,
      allowPhoto: parsed.data.allowPhoto,
      allowPerformanceData: parsed.data.allowPerformanceData,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: ADVOCACY_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(
      { ok: true, testimonialId: result.testimonial.id },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/clients/:id/testimonials] Failed to save testimonial.", error);
    return NextResponse.json(
      { error: "Unable to save the testimonial right now." },
      { status: 500 },
    );
  }
}
