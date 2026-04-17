import { Settings2 } from "lucide-react";
import Link from "next/link";

import { SignOutButton } from "@/components/layout/sign-out-button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { roleLabels } from "@/lib/permissions";

export function Topbar({
  name,
  role,
  email,
  avatarUrl,
}: {
  name?: string | null;
  role: string;
  email?: string | null;
  avatarUrl?: string | null;
}) {
  return (
    <header className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-4">
        <Avatar src={avatarUrl} fallback={name ?? email ?? "EU"} className="h-14 w-14" />
        <div>
          <p className="text-sm text-slate-500">Agency workspace</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              {name}
            </h2>
            <Badge tone="sky">{roleLabels[role as keyof typeof roleLabels] ?? role.replace("_", " ")}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{email}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Settings2 className="h-4 w-4" />
          Account settings
        </Link>
        <SignOutButton />
      </div>
    </header>
  );
}
