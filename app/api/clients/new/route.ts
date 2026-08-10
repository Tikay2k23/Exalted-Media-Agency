import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  CREATE_CLIENT_FAILURE_STATUS,
  createClient,
} from "@/lib/workflow/client-intake-service";
import { newClientSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Guided client creation.
 *
 * Separate from the older POST /api/clients, which creates a bare row. This
 * one places the client on the journey, staffs it, and generates the
 * onboarding work - the difference between "a record exists" and "somebody is
 * doing something about it".
 */
export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = newClientSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid client details" },
        { status: 400 },
      );
    }

    const toDate = (value?: string) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const result = await createClient({
      actor,
      companyName: parsed.data.companyName,
      contactName: parsed.data.contactName,
      contactEmail: parsed.data.contactEmail,
      contactPhone: parsed.data.contactPhone,
      website: parsed.data.website,
      serviceType: parsed.data.serviceType,
      monthlyValue: parsed.data.monthlyValue,
      contractStartDate: toDate(parsed.data.contractStartDate),
      contractEndDate: toDate(parsed.data.contractEndDate),
      targetLaunchDate: toDate(parsed.data.targetLaunchDate),
      mainGoal: parsed.data.mainGoal,
      mainProblem: parsed.data.mainProblem,
      targetAudience: parsed.data.targetAudience,
      mainOffer: parsed.data.mainOffer,
      projectManagerId: parsed.data.projectManagerId,
      specialistOwners: parsed.data.specialistOwners,
      notes: parsed.data.notes,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: CREATE_CLIENT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        clientId: result.client.id,
        generatedTaskCount: result.generatedTaskCount,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/clients/new] Failed to create client.", error);
    return NextResponse.json(
      { error: "Unable to create this client right now." },
      { status: 500 },
    );
  }
}
