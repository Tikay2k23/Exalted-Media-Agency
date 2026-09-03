import { NextResponse } from "next/server";
import { z } from "zod";

import {
  RESOURCE_FAILURE_STATUS,
  createDocumentResource,
  createLinkResource,
  listResourcesForSop,
} from "@/lib/governance/resource-service";
import { resourceActor } from "@/lib/governance/resource-auth";
import { ResourceType } from "@prisma/client";

export const runtime = "nodejs";

const documentSchema = z.object({
  source: z.literal("DOCUMENT"),
  sopId: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["HOW_TO_GUIDE", "SCRIPT", "TEMPLATE", "CHECKLIST", "REFERENCE_GUIDE"]),
  description: z.string().optional(),
  content: z.string().min(1),
  ownerId: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});

const linkSchema = z.object({
  source: z.literal("LINK"),
  sopId: z.string().min(1),
  title: z.string().min(1),
  type: z
    .enum(["HOW_TO_GUIDE", "SCRIPT", "TEMPLATE", "CHECKLIST", "REFERENCE_GUIDE", "EXTERNAL_LINK"])
    .optional(),
  description: z.string().optional(),
  externalUrl: z.string().min(1),
  ownerId: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});

const bodySchema = z.discriminatedUnion("source", [documentSchema, linkSchema]);

/** Lists the resources linked to a SOP (metadata only), filtered and searched. */
export async function GET(request: Request) {
  const auth = await resourceActor();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const sopId = url.searchParams.get("sopId");

  if (!sopId) {
    return NextResponse.json({ error: "A sopId is required." }, { status: 400 });
  }

  const typeParam = url.searchParams.get("type");
  const type =
    typeParam && (Object.values(ResourceType) as string[]).includes(typeParam)
      ? (typeParam as ResourceType)
      : null;

  const resources = await listResourcesForSop(sopId, {
    query: url.searchParams.get("q") ?? undefined,
    type,
  });

  return NextResponse.json({ resources });
}

/** Creates a document or a link resource and attaches it to the SOP. */
export async function POST(request: Request) {
  const auth = await resourceActor();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid resource details." }, { status: 400 });
  }

  const result =
    parsed.data.source === "DOCUMENT"
      ? await createDocumentResource({ actor: auth.actor, ...parsed.data, type: parsed.data.type })
      : await createLinkResource({
          actor: auth.actor,
          ...parsed.data,
          type: parsed.data.type ? (parsed.data.type as ResourceType) : undefined,
        });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: RESOURCE_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true, resourceId: result.resourceId }, { status: 201 });
}
