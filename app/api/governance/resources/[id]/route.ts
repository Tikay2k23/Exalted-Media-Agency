import { NextResponse } from "next/server";
import { z } from "zod";

import { resourceActor } from "@/lib/governance/resource-auth";
import {
  RESOURCE_FAILURE_STATUS,
  deleteResource,
  getResourceDetail,
  updateResource,
} from "@/lib/governance/resource-service";
import { ResourceType } from "@prisma/client";

export const runtime = "nodejs";

/** One resource in full, including its content and every SOP it is linked to. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resourceActor();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const resource = await getResourceDetail(id);

  if (!resource) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  /*
   * The raw blob URL never leaves the server. A private blob's URL is useless
   * without the store token, but there is no reason to hand it to the browser at
   * all - files are reached only through the download route. `hasFile` tells the
   * client a file exists without disclosing where it lives.
   */
  const { fileUrl, ...clientSafe } = resource;

  return NextResponse.json({ resource: { ...clientSafe, hasFile: Boolean(fileUrl) } });
}

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  type: z
    .enum(["HOW_TO_GUIDE", "SCRIPT", "TEMPLATE", "CHECKLIST", "REFERENCE_GUIDE", "FILE", "EXTERNAL_LINK"])
    .optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  ownerId: z.string().nullable().optional(),
  content: z.string().optional(),
  externalUrl: z.string().optional(),
});

/** Edits a resource's details. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resourceActor();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid resource details." }, { status: 400 });
  }

  const result = await updateResource({
    actor: auth.actor,
    resourceId: id,
    ...parsed.data,
    type: parsed.data.type ? (parsed.data.type as ResourceType) : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: RESOURCE_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true });
}

/** Permanently deletes a resource. Removes it from every SOP; distinct from unlinking. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resourceActor();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const result = await deleteResource({ actor: auth.actor, resourceId: id });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: RESOURCE_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true });
}
