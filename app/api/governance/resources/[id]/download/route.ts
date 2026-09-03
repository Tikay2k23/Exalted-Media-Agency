import { NextResponse } from "next/server";

import { resourceActor } from "@/lib/governance/resource-auth";
import { getResourceDetail } from "@/lib/governance/resource-service";

export const runtime = "nodejs";

/**
 * Streams a file resource's bytes with its original filename.
 *
 * Goes through the app rather than handing out the blob URL directly, so the
 * download passes the same governance.view check as everything else and arrives
 * named "Lead Qualification Notes.docx" rather than the random blob path. The
 * bytes are fetched server-side and relayed; nothing is held in the database.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resourceActor();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const resource = await getResourceDetail(id);

  if (!resource || resource.source !== "FILE" || !resource.fileUrl) {
    return NextResponse.json({ error: "No file to download." }, { status: 404 });
  }

  const upstream = await fetch(resource.fileUrl);

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "The file could not be retrieved." }, { status: 502 });
  }

  const fileName = (resource.fileName ?? "resource").replace(/"/g, "");

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": resource.fileMimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      ...(resource.fileSize ? { "Content-Length": String(resource.fileSize) } : {}),
    },
  });
}
