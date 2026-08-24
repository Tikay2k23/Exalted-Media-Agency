import Link from "next/link";
import { notFound } from "next/navigation";

import { A2PProfileWorkspace } from "@/components/clients/a2p-profile";
import { a2pApplies, a2pReadiness, sampleMessageWarnings } from "@/lib/a2p/a2p-readiness";
import { loadAuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = { title: "A2P registration" };

/**
 * The A2P registration workspace for one client.
 *
 * A page of its own rather than a panel on Strategy: this is a registration
 * form with sixty-odd fields, a review trail and a submission history, and the
 * Strategy tab's job is to summarise rather than to hold all of that.
 */
export default async function A2PPage({ params }: { params: Promise<{ id: string }> }) {
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
    select: {
      id: true,
      companyName: true,
      serviceType: true,
      projects: { select: { serviceType: true } },
      assets: {
        where: { status: { in: ["RECEIVED", "APPROVED"] } },
        select: { type: true },
      },
      a2pProfile: {
        include: {
          samples: { orderBy: { position: "asc" } },
          submissions: {
            orderBy: { submittedAt: "desc" },
            include: { submittedBy: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!client) notFound();

  const services = [client.serviceType, ...client.projects.map((project) => project.serviceType)];

  /*
   * A client who bought nothing that sends SMS has nothing to register. Saying
   * so plainly beats showing them an empty sixty-field form.
   */
  if (!a2pApplies(services) && !client.a2pProfile) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link
          href={`/clients/${client.id}?tab=services`}
          className="text-xs font-medium text-slate-500 transition hover:text-slate-900"
        >
          ← Back to Strategy
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-950">
            A2P registration is not required
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">
            {client.companyName} has not bought anything that sends SMS, so there is nothing to
            register. If that changes, the services on the account are what decides it.
          </p>
        </div>
      </div>
    );
  }

  const profile = client.a2pProfile;
  const documents = client.assets.map((asset) => asset.type);

  const shape = {
    ...(profile ?? {}),
    samples:
      profile?.samples.map((sample) => ({ category: sample.category, body: sample.body })) ?? [],
    documents,
  };

  const readiness = a2pReadiness(shape);
  const warnings = sampleMessageWarnings(shape);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/clients/${client.id}?tab=services`}
            className="text-xs font-medium text-slate-500 transition hover:text-slate-900"
          >
            ← Back to Strategy
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            A2P registration
          </h1>
          <p className="mt-1 text-sm text-slate-600">{client.companyName}</p>
        </div>
      </div>

      <A2PProfileWorkspace
        clientId={client.id}
        companyName={client.companyName}
        status={profile?.status ?? "INFORMATION_NEEDED"}
        readiness={readiness}
        warnings={warnings}
        initial={{
          legalName: profile?.legalName ?? "",
          dbaName: profile?.dbaName ?? "",
          entityType: profile?.entityType ?? "",
          countryOfRegistration: profile?.countryOfRegistration ?? "",
          taxId: profile?.taxId ?? "",
          addressLine1: profile?.addressLine1 ?? "",
          addressLine2: profile?.addressLine2 ?? "",
          city: profile?.city ?? "",
          stateRegion: profile?.stateRegion ?? "",
          postalCode: profile?.postalCode ?? "",
          country: profile?.country ?? "",
          businessPhone: profile?.businessPhone ?? "",
          businessEmail: profile?.businessEmail ?? "",
          websiteUrl: profile?.websiteUrl ?? "",
          representativeName: profile?.representativeName ?? "",
          representativeTitle: profile?.representativeTitle ?? "",
          representativeEmail: profile?.representativeEmail ?? "",
          representativePhone: profile?.representativePhone ?? "",
          representativeRelation: profile?.representativeRelation ?? "",
          authorisationConfirmed: profile?.authorisationConfirmedAt !== null
            && profile?.authorisationConfirmedAt !== undefined,
          useCases: profile?.useCases ?? [],
          useCaseOther: profile?.useCaseOther ?? "",
          internalUseCase: profile?.internalUseCase ?? "",
          clientCampaignDescription: profile?.clientCampaignDescription ?? "",
          reviewedCampaignDescription: profile?.reviewedCampaignDescription ?? "",
          optInMethods: profile?.optInMethods ?? [],
          optInMethodOther: profile?.optInMethodOther ?? "",
          optInPageUrl: profile?.optInPageUrl ?? "",
          optInFormUrl: profile?.optInFormUrl ?? "",
          optInCheckboxText: profile?.optInCheckboxText ?? "",
          consentLanguage: profile?.consentLanguage ?? "",
          checkboxIsOptional: profile?.checkboxIsOptional ?? null,
          checkboxUncheckedByDefault: profile?.checkboxUncheckedByDefault ?? null,
          privacyPolicyUrl: profile?.privacyPolicyUrl ?? "",
          termsUrl: profile?.termsUrl ?? "",
          smsTermsUrl: profile?.smsTermsUrl ?? "",
          messagesContainLinks: profile?.messagesContainLinks ?? null,
          linkDomains: profile?.linkDomains ?? "",
          messagesContainPhoneNumbers: profile?.messagesContainPhoneNumbers ?? null,
          monthlyVolume: profile?.monthlyVolume ?? "",
          monthlyLeads: profile?.monthlyLeads ?? "",
          isTwoWay: profile?.isTwoWay ?? null,
          businessHours: profile?.businessHours ?? "",
          repliesHandledBy: profile?.repliesHandledBy ?? "",
          needsMissedCallTextBack: profile?.needsMissedCallTextBack ?? null,
          existingPhoneNumber: profile?.existingPhoneNumber ?? "",
          keepExistingNumber: profile?.keepExistingNumber ?? null,
          needsNewNumber: profile?.needsNewNumber ?? null,
          preferredAreaCode: profile?.preferredAreaCode ?? "",
          forwardingNumber: profile?.forwardingNumber ?? "",
          inboundCallRecipient: profile?.inboundCallRecipient ?? "",
          voicemailRequired: profile?.voicemailRequired ?? null,
          smsInboxUsers: profile?.smsInboxUsers ?? "",
          primarySmsResponder: profile?.primarySmsResponder ?? "",
          afterHoursBehaviour: profile?.afterHoursBehaviour ?? "",
        }}
        initialSamples={
          profile?.samples.map((sample) => ({
            id: sample.id,
            category: sample.category,
            body: sample.body,
            reviewNote: sample.reviewNote ?? "",
          })) ?? []
        }
        submissions={
          profile?.submissions.map((submission) => ({
            id: submission.id,
            provider: submission.provider,
            brandId: submission.brandId,
            campaignId: submission.campaignId,
            providerStatus: submission.providerStatus,
            rejectedReason: submission.rejectedReason,
            submittedByName: submission.submittedBy?.name ?? null,
            submittedAt: submission.submittedAt.toISOString(),
          })) ?? []
        }
        /* Saying a carrier approved a registration is not the same authority as
           editing a client, so it follows the stricter permission. */
        canRecordDecision={can(actor, "a2p.submit")}
      />
    </div>
  );
}
