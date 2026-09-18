import type { Metadata } from "next";
import Link from "next/link";

import { InviteForm } from "@/components/auth/invite-form";
import { readInvite } from "@/lib/team/invites";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = { title: "Set up your account" };

/**
 * Where an invited team member chooses their password.
 *
 * Public, like the intake form - the person has no account yet. Everything it
 * can do is gated on a valid, unexpired, single-use token, and it says nothing
 * about why a bad link is bad.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invited = await readInvite(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
        <p className="text-xs uppercase tracking-[0.32em] text-sky-600">Exalted Operations</p>

        {invited ? (
          <>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
              Welcome, {invited.name.split(" ")[0]}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Choose a password to finish setting up your account.
            </p>
            <div className="mt-6">
              <InviteForm token={token} email={invited.email} />
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
              This link is no longer valid
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Invitation links expire after seven days and work once. Ask the person who added you
              for a new one.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
