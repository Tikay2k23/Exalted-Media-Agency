/**
 * Who to ring, and what to ring them about.
 *
 * The list is generated, never kept. A hand-maintained "people to chase" list
 * is wrong the moment somebody sends a logo, and the person who would have
 * updated it is the person who stopped reading it. Here a contact appears
 * because they owe something and disappears when they stop owing it - there is
 * no state to fall out of date.
 *
 * Two rules shape the grouping:
 *
 *   - a contact with nothing outstanding is not listed, however important
 *   - an outstanding thing with no named contact is not dropped
 *
 * The second matters more than it looks. Most client obligations are raised
 * against the account rather than against a person - a missing Meta login
 * belongs to whoever can grant it - and a list that silently omitted them
 * would be a chase list that misses most of the chasing.
 */

import {
  sortOutstanding,
  outstandingPriority,
  type OutstandingItem,
} from "@/lib/journey/onboarding-focus";

export interface ChaseContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
  isApprover: boolean;
}

export interface ChaseGroup {
  /** Null only when the account has no contacts at all. */
  contact: ChaseContact | null;
  items: OutstandingItem[];
  /**
   * True when these items were not raised against this person by name.
   *
   * They land on the primary contact because that is who somebody would
   * actually ring, but the interface says so rather than implying a precision
   * the records do not have.
   */
  byDefault: boolean;
  /** When the oldest of these was first asked for. */
  firstRequestedAt: string | null;
  /** The most recent chase across the group. */
  lastFollowUpAt: string | null;
  /** Total recorded chases across the group. */
  followUpCount: number;
  /** Days since the oldest item was first asked for. */
  daysWaiting: number | null;
  /** Whether anything here is past its date. */
  hasOverdue: boolean;
}

function daysBetween(from: string, now: Date) {
  const startOf = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  return Math.round(
    (startOf(now).getTime() - startOf(new Date(from)).getTime()) / 86_400_000,
  );
}

/**
 * The chase list.
 *
 * Only client-owned items: a requirement the agency owes itself is real work
 * and belongs on the board, but nobody is going to phone the client about it.
 */
export function contactsToChase(
  items: OutstandingItem[],
  contacts: ChaseContact[],
  now: Date,
): ChaseGroup[] {
  const chaseable = items.filter((item) => item.clientOwned);

  if (chaseable.length === 0) return [];

  const byContact = new Map<string, OutstandingItem[]>();
  const unattributed: OutstandingItem[] = [];

  for (const item of chaseable) {
    const contact = item.contactId
      ? contacts.find((candidate) => candidate.id === item.contactId)
      : undefined;

    if (!contact) {
      unattributed.push(item);
      continue;
    }

    const existing = byContact.get(contact.id);

    if (existing) existing.push(item);
    else byContact.set(contact.id, [item]);
  }

  const primary = contacts.find((contact) => contact.isPrimary) ?? contacts[0] ?? null;
  const groups: ChaseGroup[] = [];

  for (const [contactId, contactItems] of byContact) {
    const contact = contacts.find((candidate) => candidate.id === contactId);

    if (!contact) continue;

    groups.push(buildGroup(contact, contactItems, false, now));
  }

  if (unattributed.length > 0) {
    /*
     * Merged into the primary's own group rather than shown beside it: one
     * person, one phone call. The flag stays on whichever group carries them
     * so the drawer can say which of these were raised by name.
     */
    const existing = primary ? groups.find((group) => group.contact?.id === primary.id) : undefined;

    if (existing) {
      const merged = buildGroup(
        existing.contact as ChaseContact,
        [...existing.items, ...unattributed],
        true,
        now,
      );

      groups[groups.indexOf(existing)] = merged;
    } else {
      groups.push(buildGroup(primary, unattributed, true, now));
    }
  }

  /*
   * Most urgent person first, judged by their single worst item. Ranking by
   * count instead would put somebody sitting on five optional questions above
   * the one person holding an overdue approval.
   */
  return groups.sort((left, right) => {
    const leftWorst = Math.min(...left.items.map(outstandingPriority));
    const rightWorst = Math.min(...right.items.map(outstandingPriority));

    if (leftWorst !== rightWorst) return leftWorst - rightWorst;

    return (right.daysWaiting ?? 0) - (left.daysWaiting ?? 0);
  });
}

function buildGroup(
  contact: ChaseContact | null,
  items: OutstandingItem[],
  byDefault: boolean,
  now: Date,
): ChaseGroup {
  const sorted = sortOutstanding(items);
  const requested = items
    .map((item) => item.requestedAt)
    .filter((value): value is string => value !== null)
    .sort();
  const chases = items
    .map((item) => item.lastFollowUpAt)
    .filter((value): value is string => value !== null)
    .sort();

  const firstRequestedAt = requested[0] ?? null;

  return {
    contact,
    items: sorted,
    byDefault,
    firstRequestedAt,
    lastFollowUpAt: chases.at(-1) ?? null,
    followUpCount: items.reduce((total, item) => total + item.followUpCount, 0),
    daysWaiting: firstRequestedAt ? daysBetween(firstRequestedAt, now) : null,
    hasOverdue: items.some((item) => item.overdue),
  };
}
