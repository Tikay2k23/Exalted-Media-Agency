import { BellDot } from "lucide-react";

import { SignOutButton } from "@/components/layout/sign-out-button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

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
          <p className="text-sm text-slate-500">Signed in as</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              {name}
            </h2>
            <Badge tone="sky">{role.replace("_", " ")}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{email}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 md:flex">
          <BellDot className="h-4 w-4 text-sky-500" />
          Marketing operations synced live
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
