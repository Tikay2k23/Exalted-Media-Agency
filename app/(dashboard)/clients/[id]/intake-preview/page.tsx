import { notFound } from "next/navigation";
import Link from "next/link";

import { loadAuthContext } from "@/lib/authz";
import { sectionsForService } from "@/lib/intake/question-catalogue";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatEnumLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = { title: "Intake form preview" };

/**
 * The intake form as the client will see it.
 *
 * Read-only and deliberately inert: no token is minted, no form record is
 * touched and nothing can be submitted from here. It renders the same
 * sectionsForService catalogue the real form renders, so a preview cannot
 * drift from what actually gets sent - which is the whole point of previewing
 * rather than describing.
 */
export default async function IntakePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const actor = await loadAuthContext(user.id);

  if (!actor) notFound();

  const client = await prisma.client.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: { id: true, companyName: true, serviceType: true },
  });

  if (!client) notFound();

  // Exactly the sections this client would be asked, given what they bought.
  const sections = sectionsForService(client.serviceType);
  const required = sections.reduce(
    (total, section) => total + section.questions.filter((q) => q.required).length,
    0,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/clients/${client.id}?tab=services`}
            className="text-xs font-medium text-slate-500 transition hover:text-slate-900"
          >
            ← Back to Strategy
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            Intake form preview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            What {client.companyName} will be asked, based on {formatEnumLabel(client.serviceType)}.
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          Preview only
        </span>
      </div>

      <p className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs text-sky-800">
        Nothing here is live. No link is created and no answers can be submitted from this page.
        {" "}
        {sections.length} section{sections.length === 1 ? "" : "s"}, {required} required answer
        {required === 1 ? "" : "s"}.
      </p>

      {sections.map((section) => (
        <section key={section.id} className="rounded-2xl border border-slate-200 bg-white">
          <header className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">{section.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{section.description}</p>
          </header>

          <ul className="divide-y divide-slate-100">
            {section.questions.map((question) => (
              <li key={question.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-slate-800">{question.label}</p>
                  {question.required ? (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                      Required
                    </span>
                  ) : null}
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    {question.kind}
                  </span>
                </div>
                {question.help ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">{question.help}</p>
                ) : null}
                {/* Inert on purpose: it shows the shape of the answer without
                    offering anywhere to type. Choices list what is on offer,
                    because "which options does this ask for" is most of the
                    reason to look at a preview. */}
                {question.options?.length ? (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {question.options.map((option) => (
                      <li
                        key={option.value}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600"
                      >
                        {option.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1.5 h-9 rounded-lg border border-dashed border-slate-200 bg-slate-50" />
                )}

                {question.showWhen ? (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Only asked depending on an earlier answer.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
