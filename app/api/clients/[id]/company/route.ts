import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";
import { clientCompanySchema } from "@/lib/validators";

export const runtime = "nodejs";

/** Stored as a real URL so the link works; typed however somebody likes. */
function normaliseWebsite(value: string) {
  if (!value) return null;

  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

const FIELD_LABELS: Record<string, string> = {
  legalName: "legal business name",
  website: "website",
  industry: "industry",
  addressLine1: "address",
  addressLine2: "address",
  city: "city",
  stateRegion: "state",
  postalCode: "postcode",
  country: "country",
  businessPhone: "business phone",
  businessEmail: "business email",
  serviceArea: "service area",
  taxId: "tax ID",
  timezone: "timezone",
};

/**
 * The company behind the account.
 *
 * Every field is optional and an empty string clears it, which is deliberate:
 * these are facts somebody learns over time, and being able to remove one that
 * turned out to be wrong matters as much as adding it.
 *
 * The activity entry names what changed rather than saying "updated", because
 * "company information updated" tells a reader nothing they can act on.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = clientCompanySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Check the details and try again.",
          field: parsed.error.issues[0]?.path[0],
        },
        { status: 400 },
      );
    }

    const before = await prisma.client.findUniqueOrThrow({
      where: { id: guard.client.id },
      select: {
        legalName: true,
        website: true,
        industry: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        stateRegion: true,
        postalCode: true,
        country: true,
        businessPhone: true,
        businessEmail: true,
        serviceArea: true,
        taxId: true,
        timezone: true,
      },
    });

    const data = Object.fromEntries(
      Object.entries(parsed.data).map(([key, value]) => [
        key,
        key === "website"
          ? normaliseWebsite(String(value ?? ""))
          : String(value ?? "").trim() || null,
      ]),
    );

    await prisma.client.update({ where: { id: guard.client.id }, data });

    const changed = Object.keys(data).filter(
      (key) => before[key as keyof typeof before] !== data[key],
    );

    // Nothing moved, so nothing is worth recording. An audit trail full of
    // "updated (no change)" is an audit trail nobody reads.
    if (changed.length > 0) {
      const named = [...new Set(changed.map((key) => FIELD_LABELS[key] ?? key))];

      await logActivity({
        actorId: guard.actor.id,
        action: `Updated ${named.join(", ")} for ${guard.client.companyName}`,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: { fields: changed },
      });
    }

    return NextResponse.json({ ok: true, changed: changed.length });
  } catch (error) {
    return serverFailure("api/clients/:id/company", error);
  }
}
