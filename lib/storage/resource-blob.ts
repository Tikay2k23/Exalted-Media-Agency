import { del, put } from "@vercel/blob";

/**
 * File storage for SOP resources, on Vercel Blob.
 *
 * The application is deployed on Vercel, so Blob is the native durable store -
 * it handles a DOCX or a PDF at any size, unlike the base64-in-Postgres trick
 * the avatar uses, which would put multi-megabyte rows in a managed database
 * with a connection ceiling.
 *
 * Blob reads BLOB_READ_WRITE_TOKEN from the environment. Until that is set the
 * store is not reachable, and every function here refuses rather than pretending
 * a file was saved: the upload route turns that refusal into an honest "storage
 * is not configured" instead of a broken resource record pointing at nothing.
 *
 * To turn it on: enable Blob for the project in the Vercel dashboard (Storage →
 * Create → Blob), then `vercel env pull` or add BLOB_READ_WRITE_TOKEN to the
 * environment. No code changes.
 */

/** What a resource file may be. Checked against the bytes, not just the name. */
export const ALLOWED_RESOURCE_FILES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  "text/markdown": [".md"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

/** 25 MB. Comfortably above a document, well below anything that belongs in a CDN. */
export const MAX_RESOURCE_FILE_BYTES = 25 * 1024 * 1024;

export function isStorageConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export interface StoredFile {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
}

/**
 * Validates and stores one file, returning where it landed.
 *
 * `random` suffixes on the pathname so two people uploading "notes.docx" do not
 * collide and so the URL cannot be guessed from the title. The original name is
 * kept separately on the record for display and download.
 */
export async function putResourceFile(file: File): Promise<StoredFile> {
  if (!isStorageConfigured()) {
    throw new StorageNotConfiguredError();
  }

  const put_ = await put(`sop-resources/${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type || "application/octet-stream",
  });

  return {
    url: put_.url,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };
}

/** Removes a stored file. Best-effort: a delete that fails must not strand the caller. */
export async function deleteResourceFile(url: string) {
  if (!isStorageConfigured()) return;

  try {
    await del(url);
  } catch {
    /* The row is already gone; a leaked blob is cheaper than a failed request. */
  }
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("File storage is not configured.");
    this.name = "StorageNotConfiguredError";
  }
}
