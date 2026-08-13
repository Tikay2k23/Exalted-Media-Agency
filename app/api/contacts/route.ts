import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { findContactMatches } from "@/lib/sales/contact-service";

export const runtime = "nodejs";

/**
 * Contacts, for the two questions the sales UI asks about them.
 *
 * `?email=&phone=&company=` answers "does this person already exist" while
 * somebody is still typing the Add Lead form, so the duplicate warning arrives
 * before they have filled in the rest of it rather than after they submit.
 *
 * `?search=` is the picker for creating a second opportunity against somebody
 * the agency already knows.
 */
export async function GET(request: Request) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await loadAuthContext(session.user.id);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Contacts are the sales book. Seeing them is the same permission as seeing
  // the leads hanging off them.
  if (!can(actor, "leads.view.all") && !can(actor, "leads.view.assigned")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";

  if (search) {
    const contacts = await prisma.contact.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { businessName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
        ],
      },
      orderBy: { name: "asc" },
      take: 20,
      select: {
        id: true,
        name: true,
        businessName: true,
        email: true,
        phone: true,
        _count: { select: { opportunities: true } },
      },
    });

    return NextResponse.json({
      contacts: contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        businessName: contact.businessName,
        email: contact.email,
        phone: contact.phone,
        opportunityCount: contact._count.opportunities,
      })),
    });
  }

  const matches = await findContactMatches({
    email: url.searchParams.get("email"),
    phone: url.searchParams.get("phone"),
    businessName: url.searchParams.get("company"),
    excludeContactId: url.searchParams.get("exclude"),
  });

  return NextResponse.json({ matches });
}
