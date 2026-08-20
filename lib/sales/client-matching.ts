import type { Prisma } from "@prisma/client";

import {
  type MatchConfidence,
  MATCH_RANK,
  MATCH_REASON,
  companyKeyOf,
  contactKeys,
  emailKeyOf,
  phoneKeyOf,
} from "@/lib/sales/contact-matching";
import { prisma } from "@/lib/prisma";

/**
 * Finding the client the agency already has.
 *
 * Creating a second client record for an existing account is the single worst
 * thing a conversion can do: delivery works one record while the money lands
 * against the other, and neither tells the whole story afterwards.
 *
 * The matching rules are the ones the contact register already uses - same
 * email, then same phone, then same business name - imported rather than
 * restated so the two can never drift into disagreeing about what a duplicate
 * is. What is different here is the search: Client has no normalised key
 * columns the way Contact does, so candidates are narrowed in the database and
 * the confidence is decided in memory against the same key functions.
 */

export type ClientMatchConfidence = MatchConfidence | "linked-contact";

export interface ClientMatch {
  clientId: string;
  companyName: string;
  contactEmail: string;
  contactPhone: string | null;
  stageName: string;
  confidence: ClientMatchConfidence;
  reason: string;
  /** True when creating a second account needs a deliberate decision. */
  isStrong: boolean;
}

const RANK: Record<ClientMatchConfidence, number> = {
  // An existing lead against the same contact that already converted is the
  // strongest signal there is: somebody has already made this exact judgement.
  "linked-contact": 4,
  ...MATCH_RANK,
};

const REASON: Record<ClientMatchConfidence, string> = {
  "linked-contact": "Another opportunity for this contact already converted",
  ...MATCH_REASON,
};

export interface MatchableLead {
  id: string;
  contactId: string | null;
  contactName: string;
  businessName: string;
  email: string | null;
  phone: string | null;
}

/**
 * Every account that might already be this lead, strongest first.
 *
 * A company-name-only match is returned rather than suppressed. Whether "Dr
 * Steven" and "Best Life Chiropractic" are one relationship is a judgement the
 * person closing the deal can make and this function cannot; hiding it would
 * create the duplicate it exists to prevent, and treating it as certain would
 * merge two separate accounts.
 */
export async function findClientMatches(lead: MatchableLead): Promise<ClientMatch[]> {
  const keys = contactKeys({
    businessName: lead.businessName,
    email: lead.email,
    phone: lead.phone,
  });

  /*
   * Narrow in the database, decide in memory.
   *
   * The where clause is deliberately loose - it only has to be a superset of
   * what could match, because the actual confidence is settled below by the
   * same key functions the contact register uses. Doing it the other way round
   * would mean encoding the normalisation rules twice, in SQL and in
   * TypeScript, and they would disagree the first time either changed.
   */
  const or: Prisma.ClientWhereInput[] = [
    { companyName: { equals: lead.businessName, mode: "insensitive" } },
  ];

  if (lead.email) {
    or.push({ contactEmail: { equals: lead.email, mode: "insensitive" } });
  }

  // Phone is normalised to digits before it is compared, so the database
  // cannot do the narrowing - every account with a number recorded is a
  // candidate, and phoneKeyOf decides below.
  if (lead.phone) {
    or.push({ contactPhone: { not: null } });
  }

  if (lead.contactId) {
    or.push({ sourceLead: { contactId: lead.contactId } });
  }

  const candidates = await prisma.client.findMany({
    where: { deletedAt: null, OR: or },
    select: {
      id: true,
      companyName: true,
      clientName: true,
      contactEmail: true,
      contactPhone: true,
      currentStage: { select: { name: true } },
      sourceLead: { select: { id: true, contactId: true } },
    },
    // A duplicate check that silently stops looking is worse than a slow one,
    // but an unbounded scan on a growing table is its own problem. Agencies
    // this size are far below the cap; if one is ever reached, the strongest
    // matches are still the ones returned because of the ordering below.
    take: 200,
  });

  const matches: ClientMatch[] = [];

  for (const candidate of candidates) {
    const confidence: ClientMatchConfidence | null =
      lead.contactId && candidate.sourceLead?.contactId === lead.contactId
        ? "linked-contact"
        : keys.emailKey && keys.emailKey === emailKeyOf(candidate.contactEmail)
          ? "email"
          : keys.phoneKey && keys.phoneKey === phoneKeyOf(candidate.contactPhone)
            ? "phone"
            : keys.companyKey && keys.companyKey === companyKeyOf(candidate.companyName)
              ? "company"
              : null;

    if (!confidence) continue;

    matches.push({
      clientId: candidate.id,
      companyName: candidate.companyName,
      contactEmail: candidate.contactEmail,
      contactPhone: candidate.contactPhone,
      stageName: candidate.currentStage?.name ?? "Unknown stage",
      confidence,
      reason: REASON[confidence],
      isStrong: confidence !== "company",
    });
  }

  return matches.sort(
    (a, b) =>
      RANK[b.confidence] - RANK[a.confidence] || a.companyName.localeCompare(b.companyName),
  );
}

/**
 * The match a confirmation dialog should preselect, if any.
 *
 * Only a strong one. A shared business name is a question worth showing and
 * not an answer worth defaulting to - three franchises of one brand are three
 * accounts, and defaulting to a merge would be the harder mistake to undo.
 */
export function suggestedMatch(matches: ClientMatch[]): ClientMatch | null {
  return matches.find((match) => match.isStrong) ?? null;
}
