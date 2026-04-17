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

      setError(null);
      setAvatarPreview(result);
      setAvatarPayload(result);
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

        <form action={handleSubmit} className="grid gap-4 md:grid-cols-2">
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
