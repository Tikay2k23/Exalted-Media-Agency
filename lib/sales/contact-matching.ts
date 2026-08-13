/**
 * Deciding whether two people are the same person.
 *
 * Pure and shared, because the answer has to be identical in three places that
 * would otherwise drift: the Add Lead form's duplicate warning, the importer's
 * duplicate column, and the backfill that grouped the existing rows. A form
 * that says "no duplicate" over an importer that says "duplicate" is worse than
 * either rule on its own.
 *
 * Nothing here touches the database. The service passes candidate rows in.
 */

/** Loose enough to accept real addresses, strict enough to reject a name. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercased and trimmed, or null when it is not an address at all. */
export function emailKeyOf(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Digits only.
 *
 * "(555) 010-9987", "555-010-9987" and "+1 555 010 9987" are one number typed
 * three ways, and a CRM that treats them as three people is the reason nobody
 * trusts its duplicate warnings. The leading country code is kept - stripping
 * it would merge two genuinely different numbers that happen to share a tail.
 *
 * Below seven digits is an extension or a typo, not a phone number, so it does
 * not become a match key: matching on "0000" would collapse unrelated records.
 */
export function phoneKeyOf(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

/** Lowercased company name, punctuation and legal suffixes left intact. */
export function companyKeyOf(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ContactIdentity {
  email?: string | null;
  phone?: string | null;
  businessName?: string | null;
}

export interface ContactKeys {
  emailKey: string | null;
  phoneKey: string | null;
  companyKey: string;
}

export function contactKeys(identity: ContactIdentity): ContactKeys {
  return {
    emailKey: emailKeyOf(identity.email),
    phoneKey: phoneKeyOf(identity.phone),
    companyKey: companyKeyOf(identity.businessName),
  };
}

/**
 * How sure we are that two records are the same contact.
 *
 * Ordered, and the order is the whole point. An email match is a fact. A phone
 * match is nearly a fact - shared switchboards exist. A company match is a
 * suggestion: two people at the same firm are two contacts, so this level never
 * blocks anything on its own, it only asks.
 */
export type MatchConfidence = "email" | "phone" | "company";

export const MATCH_RANK: Record<MatchConfidence, number> = {
  email: 3,
  phone: 2,
  company: 1,
};

export const MATCH_REASON: Record<MatchConfidence, string> = {
  email: "Same email address",
  phone: "Same phone number",
  company: "Same business name",
};

export interface MatchCandidate {
  id: string;
  name: string;
  businessName: string;
  email: string | null;
  phone: string | null;
  opportunityCount: number;
}

export interface ContactMatch<T extends MatchCandidate = MatchCandidate> {
  contact: T;
  confidence: MatchConfidence;
  reason: string;
}

/**
 * The candidates that look like this identity, strongest first.
 *
 * A company-only match is returned rather than hidden, because the salesperson
 * is the one who knows whether "Dr Steven" and "Best Life Chiropractic" are the
 * same relationship. Suppressing it here would silently create the duplicate
 * this function exists to prevent; presenting it as certain would merge two
 * colleagues into one record. It is offered, and they decide.
 */
export function matchContacts<T extends MatchCandidate>(
  identity: ContactIdentity,
  candidates: T[],
): ContactMatch<T>[] {
  const keys = contactKeys(identity);

  const matches: ContactMatch<T>[] = [];

  for (const candidate of candidates) {
    const candidateKeys = contactKeys(candidate);

    const confidence: MatchConfidence | null =
      keys.emailKey && keys.emailKey === candidateKeys.emailKey
        ? "email"
        : keys.phoneKey && keys.phoneKey === candidateKeys.phoneKey
          ? "phone"
          : keys.companyKey && keys.companyKey === candidateKeys.companyKey
            ? "company"
            : null;

    if (!confidence) continue;

    matches.push({ contact: candidate, confidence, reason: MATCH_REASON[confidence] });
  }

  return matches.sort(
    (a, b) =>
      MATCH_RANK[b.confidence] - MATCH_RANK[a.confidence]
      || b.contact.opportunityCount - a.contact.opportunityCount
      || a.contact.name.localeCompare(b.contact.name),
  );
}

/**
 * Whether a match is strong enough that creating a second contact needs a
 * deliberate decision rather than a shrug.
 *
 * Email and phone only. A shared company name is a question, not an obstacle -
 * three people at one firm is normal, and blocking on it would teach everybody
 * to click straight through the warning that matters.
 */
export function isStrongMatch(match: ContactMatch): boolean {
  return match.confidence === "email" || match.confidence === "phone";
}

/**
 * What a brand-new opportunity should be called.
 *
 * The service the deal is for, if one was chosen, because "CRM Automation" is
 * what distinguishes this deal from the other two open against the same
 * account. Falls back to the business name, which is at least true.
 */
export function defaultOpportunityName(input: {
  serviceInterest?: string | null;
  businessName?: string | null;
  contactName?: string | null;
}): string {
  const service = input.serviceInterest?.trim();

  if (service) {
    const label = service
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    return label;
  }

  return input.businessName?.trim() || input.contactName?.trim() || "New opportunity";
}
