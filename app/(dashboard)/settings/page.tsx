import Link from "next/link";

import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabels } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { loadAuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatEnumLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SettingsPage() {
  const sessionUser = await requireUser();
  // The link is hidden from people who cannot use it. The page itself still
  // checks - a hidden link is tidiness, not a lock.
  const actor = await loadAuthContext(sessionUser.id);
  const canManageUsers = actor !== null && can(actor, "users.manage");
  let user:
    | {
        id: string;
        name: string;
        email: string;
        role: keyof typeof roleLabels;
        department: string;
        jobTitle: string | null;
        weeklyCapacityHours: number;
        avatarUrl: string | null;
        isActive: boolean;
      }
    | null;

  try {
    user = await prisma.user.findUnique({
      where: {
        id: sessionUser.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        jobTitle: true,
        weeklyCapacityHours: true,
        avatarUrl: true,
        isActive: true,
      },
    });
  } catch (error) {
    console.error("[settings-page] Failed to load profile.", error);
    user = null;
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle>Profile details are temporarily unavailable</CardTitle>
            <CardDescription>
              We could not load your full account record right now. Refresh this page in a moment
              to try again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-sky-700">Account</p>
            <CardTitle className="mt-3 text-3xl">Personal Settings</CardTitle>
            <CardDescription className="mt-2 text-base">
              Manage the profile information your team sees across client ownership, internal work,
              and daily operations.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="sky">{roleLabels[user.role]}</Badge>
            <Badge tone="slate">{formatEnumLabel(user.department)}</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* User administration lives here rather than in the main menu: it is a
          real page, but almost nobody's first stop. */}
      {canManageUsers ? (
        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>User accounts</CardTitle>
              <CardDescription>
                Who can sign in, which seat they hold, and what they may do.
              </CardDescription>
            </div>
            <Link
              href="/admin/users"
              className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Manage users
            </Link>
          </CardHeader>
        </Card>
      ) : null}

      <section className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <ProfileSettingsForm
          user={{
            name: user.name,
            email: user.email,
            jobTitle: user.jobTitle,
            avatarUrl: user.avatarUrl,
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle>Agency Profile</CardTitle>
            <CardDescription>
              Operational details tied to your workspace access and workload planning.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Access level</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{roleLabels[user.role]}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Department</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {formatEnumLabel(user.department)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Weekly capacity</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {user.weeklyCapacityHours} hours
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Status</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {user.isActive ? "Active team member" : "Inactive"}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
