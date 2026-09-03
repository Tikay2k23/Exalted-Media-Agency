import { NextResponse } from "next/server";

import { resourceActor } from "@/lib/governance/resource-auth";
import {
  RESOURCE_FAILURE_STATUS,
  createFileResource,
  replaceResourceFile,
} from "@/lib/governance/resource-service";
import { ResourceType } from "@prisma/client";
import {
  ALLOWED_RESOURCE_FILES,
  MAX_RESOURCE_FILE_BYTES,
  StorageNotConfiguredError,
  isStorageConfigured,
  putResourceFile,
} from "@/lib/storage/resource-blob";

export const runtime = "nodejs";

const DOC_TYPES = new Set([
  "HOW_TO_GUIDE",
  "SCRIPT",
  "TEMPLATE",
  "CHECKLIST",
  "REFERENCE_GUIDE",
  "FILE",
]);

/** Validates the bytes against the allowlist by MIME and by extension. */
function fileError(file: File): string | null {
  const allowedExts = ALLOWED_RESOURCE_FILES[file.type];

  if (!allowedExts) {
    return "That file type is not allowed.";
  }

  const name = file.name.toLowerCase();

  /* Extension must also match the declared MIME - a .exe relabelled as a DOCX
     fails here, so the type is never trusted on its name alone. */
  if (!allowedExts.some((ext) => name.endsWith(ext))) {
    return "The file's extension does not match its type.";
  }

  if (file.size <= 0) {
    return "That file is empty.";
  }

  if (file.size > MAX_RESOURCE_FILE_BYTES) {
    return `Files must be ${Math.round(MAX_RESOURCE_FILE_BYTES / (1024 * 1024))} MB or smaller.`;
  }

  return null;
}

/**
 * Uploads a file and creates a file resource, or replaces the file on one.
 *
 * The bytes go to blob storage first; only a successful store creates or updates
 * a record, so a storage failure never leaves a resource pointing at nothing.
 * Without a configured store this returns 503 rather than pretending it worked.
 */
export async function POST(request: Request) {
  const auth = await resourceActor();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      {
        error:
          "File storage is not configured. Enable Blob for this project in Vercel and set "
          + "BLOB_READ_WRITE_TOKEN, then uploads will work.",
        code: "STORAGE_UNCONFIGURED",
      },
      { status: 503 },
    );
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }

  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was provided." }, { status: 400 });
  }

  const invalid = fileError(file);

  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }

  /* Replacing the file on an existing resource. */
  const replaceId = form.get("replaceResourceId");

  if (typeof replaceId === "string" && replaceId) {
    let stored;
    try {
      stored = await putResourceFile(file);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) {
        return NextResponse.json({ error: error.message, code: "STORAGE_UNCONFIGURED" }, { status: 503 });
      }
      console.error("[resources/upload] replace failed", error);
      return NextResponse.json({ error: "The file could not be stored." }, { status: 502 });
    }

    const result = await replaceResourceFile({ actor: auth.actor, resourceId: replaceId, file: stored });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: RESOURCE_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, resourceId: replaceId });
  }

  /* Creating a new file resource. */
  const sopId = form.get("sopId");
  const title = form.get("title");

  if (typeof sopId !== "string" || !sopId || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "A title and SOP are required." }, { status: 400 });
  }

  const typeRaw = form.get("type");
  const type =
    typeof typeRaw === "string" && DOC_TYPES.has(typeRaw) ? (typeRaw as ResourceType) : undefined;
  const statusRaw = form.get("status");
  const status =
    statusRaw === "DRAFT" || statusRaw === "ACTIVE" || statusRaw === "ARCHIVED"
      ? statusRaw
      : undefined;

  let stored;
  try {
    stored = await putResourceFile(file);
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: error.message, code: "STORAGE_UNCONFIGURED" }, { status: 503 });
    }
    console.error("[resources/upload] store failed", error);
    return NextResponse.json({ error: "The file could not be stored." }, { status: 502 });
  }

  const result = await createFileResource({
    actor: auth.actor,
    sopId,
    title: title.trim(),
    description: typeof form.get("description") === "string" ? (form.get("description") as string) : undefined,
    ownerId: typeof form.get("ownerId") === "string" ? (form.get("ownerId") as string) : undefined,
    status,
    type,
    file: stored,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: RESOURCE_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true, resourceId: result.resourceId }, { status: 201 });
}
