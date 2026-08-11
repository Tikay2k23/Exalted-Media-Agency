import { notFound } from "next/navigation";

import { ExaltedMark } from "@/components/brand/exalted-mark";
import { IntakeFormClient } from "@/components/intake/intake-form-client";
import { loadIntakeByToken } from "@/lib/intake/intake-service";
import { sectionsForService } from "@/lib/intake/question-catalogue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The client-facing intake form.
 *
 * Outside the dashboard layout on purpose: this page is opened by somebody who
 * does not work here and should never see the agency's navigation, let alone a
 * sign-in prompt.
 */
export const metadata = {
  title: "Client intake",
  // A form reached by an emailed link has no business in search results.
  robots: { index: false, follow: false },
};

export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const form = await loadIntakeByToken(token);

  // A bad token and a stale one are the same answer. Anything more specific
  // would confirm to a stranger that a given link once existed.
  if (!form) {
    notFound();
  }

  // "Opened" is recorded by the form itself once it mounts, and expiry is
  // decided by the service. Neither belongs in a render: a server component
  // that writes or reads the clock while rendering may run more than once.
  const expired = form.expired;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
      <header className="mb-8">
        <div className="mb-5 flex items-center gap-3">
          <ExaltedMark className="h-9 w-9 shrink-0" idSuffix="intake" />
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            The Exalted Media
          </p>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Getting started with {form.client.companyName}
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          A few questions so we can build the right thing. You can save and come back
          — nothing is lost if you close this.
        </p>
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          We will never ask for a password. When we need access to one of your
          accounts we will ask you to invite us, so you keep control and can remove
          us at any time.
        </p>
      </header>

      {form.submittedAt ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
          <h2 className="text-xl font-semibold text-emerald-900">Thank you</h2>
          <p className="mt-2 leading-7 text-emerald-800">
            We have everything we need to get started. Your account manager will be
            in touch.
          </p>
        </div>
      ) : expired ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-8 text-center">
          <h2 className="text-xl font-semibold text-slate-900">This link has expired</h2>
          <p className="mt-2 leading-7 text-slate-600">
            Ask your account manager to send a fresh one and we will pick up where you
            left off.
          </p>
        </div>
      ) : (
        <IntakeFormClient
          token={token}
          sections={sectionsForService(form.client.serviceType)}
          initialAnswers={(form.answers as Record<string, string> | null) ?? {}}
        />
      )}
    </main>
  );
}
