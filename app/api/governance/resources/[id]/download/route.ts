import { NextResponse } from "next/server";

import { resourceActor } from "@/lib/governance/resource-auth";
import { getResourceDetail } from "@/lib/governance/resource-service";
import { StorageNotConfiguredError, readResourceFile } from "@/lib/storage/resource-blob";

export const runtime = "nodejs";

/**
 * Streams a file resource's bytes with its original filename.
 *
 * The only way to reach a private blob. The bytes are read server-side with the
 * store token and relayed, so the download passes the same governance.view check
 * as everything else and arrives named "Lead Qualification Notes.docx" rather
 * than the random blob path. The raw blob URL is never handed to the browser.
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

  let file;
  try {
    file = await readResourceFile(resource.fileUrl);
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[resources/download] read failed", error);
    return NextResponse.json({ error: "The file could not be retrieved." }, { status: 502 });
  }

  if (!file) {
    return NextResponse.json({ error: "The file could not be retrieved." }, { status: 502 });
  }

  const fileName = (resource.fileName ?? "resource").replace(/"/g, "");

  return new NextResponse(file.stream, {
    status: 200,
    headers: {
      "Content-Type": resource.fileMimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      ...(resource.fileSize ? { "Content-Length": String(resource.fileSize) } : {}),
    },
  });
}
