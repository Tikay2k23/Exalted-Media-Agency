"use client";

import { Camera, LoaderCircle, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, useState, useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ProfileSettingsFormProps {
  user: {
    name: string;
    email: string;
    jobTitle: string | null;
    avatarUrl: string | null;
  };
}

const maxUploadSizeBytes = 2 * 1024 * 1024;

/**
 * The longest edge an avatar is stored at.
 *
 * The picture is shown at 40px in the top bar and 56px on the account page, so
 * 256 is already generous - it covers a retina screen twice over. What it
 * mainly prevents is the previous behaviour: the file was stored exactly as
 * uploaded, base64 encoded, which inflates it by a third and then arrives
 * inline in the HTML of every page. One two-megabyte photo made every
 * navigation a five-megabyte download.
 */
const MAX_AVATAR_EDGE = 256;

/** Good enough for a circle this size, and a fraction of the bytes. */
const AVATAR_QUALITY = 0.85;

/**
 * Shrinks the picture in the browser before it is ever sent.
 *
 * Done here rather than on the server because the point is to avoid moving the
 * large version at all. Falls back to the original data URL if anything about
 * the canvas path fails, so a browser that will not decode the format still
 * gets the photo saved rather than an error.
 */
/**
 * Shrink an uploaded photo, and refuse anything the browser cannot read.
 *
 * Only ever returns bytes the canvas produced. That matters more than the
 * resizing: a phone can hand over a HEIC file - and label it as something
 * else - and no browser but Safari can decode HEIC. The earlier version fell
 * back to storing the uploaded bytes whenever the decode failed, so an iPhone
 * photo was saved verbatim under an image/webp label and rendered as a broken
 * image everywhere it was shown. Returning null instead lets the caller say so
 * rather than storing something unreadable.
 */
async function downscaleImage(dataUrl: string): Promise<string | null> {
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();

      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("decode failed"));
      element.src = dataUrl;
    });

    // A file the browser cannot decode can still fire onload with no pixels.
    if (!image.width || !image.height) {
      return null;
    }

    const longest = Math.max(image.width, image.height);
    const scale = longest > MAX_AVATAR_EDGE ? MAX_AVATAR_EDGE / longest : 1;

    const canvas = document.createElement("canvas");

    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Safari used to hand back a PNG when asked for WebP, which can be larger
    // than the original for a photograph. Keep whichever is actually smaller -
    // but only ever these two, never the file that came in.
    const candidates = [
      canvas.toDataURL("image/webp", AVATAR_QUALITY),
      canvas.toDataURL("image/jpeg", AVATAR_QUALITY),
    ].filter((candidate) => /^data:image\/(webp|jpeg|png);base64,/.test(candidate));

    if (!candidates.length) {
      return null;
    }

    return candidates.sort((a, b) => a.length - b.length)[0];
  } catch {
    return null;
  }
}

export function ProfileSettingsForm({ user }: ProfileSettingsFormProps) {
  const router = useRouter();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatarUrl);
  const [avatarPayload, setAvatarPayload] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please upload a PNG, JPG, WebP, or another supported image file.");
      return;
    }

    if (file.size > maxUploadSizeBytes) {
      setError("Profile photos must be 2MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;

      if (!result) {
        setError("We couldn't read that image. Please try another file.");
        return;
      }

      void downscaleImage(result).then((stored) => {
        if (!stored) {
          setError(
            "We couldn't read that image. iPhone photos are often saved as HEIC,"
            + " which browsers cannot display - choose JPEG or PNG in your camera"
            + " settings, or export the photo before uploading it.",
          );
          return;
        }

        setError(null);
        setAvatarPreview(stored);
        setAvatarPayload(stored);
      });
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setError(null);
    setAvatarPreview(null);
    setAvatarPayload("");
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          jobTitle: formData.get("jobTitle"),
          avatarUrl: avatarPayload,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't save your profile right now.");
        return;
      }

      setMessage("Profile updated successfully.");
      setAvatarPayload(undefined);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
        <CardDescription>
          Keep your agency profile current so teammates always see the right contact details,
          job title, and photo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-4 rounded-[1.75rem] border border-slate-100 bg-slate-50 p-5 sm:flex-row sm:items-center">
          <Avatar
            src={avatarPreview}
            fallback={user.name}
            alt={`${user.name} profile photo`}
            className="h-20 w-20 rounded-[1.5rem]"
          />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Profile photo</p>
              <p className="mt-1 text-sm text-slate-500">
                Upload a clean headshot or agency profile image. PNG, JPG, or WebP up to 2MB.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                <Camera className="h-4 w-4" />
                Change photo
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
              {avatarPreview ? (
                <Button type="button" variant="secondary" className="gap-2" onClick={removePhoto}>
                  <Trash2 className="h-4 w-4" />
                  Remove photo
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <form action={handleSubmit} className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-600">Full name</span>
            <Input name="name" defaultValue={user.name} required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-600">Work email</span>
            <Input name="email" type="email" defaultValue={user.email} required />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-slate-600">Job title</span>
            <Input
              name="jobTitle"
              defaultValue={user.jobTitle ?? ""}
              placeholder="Account Director, Content Strategist, Paid Media Specialist..."
            />
          </label>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <Button type="submit" className="gap-2" disabled={isPending}>
              {isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save profile
            </Button>
            {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
