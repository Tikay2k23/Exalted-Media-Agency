/**
 * Everything still owed on an account, gathered from where it already lives.
 *
 * Six systems each know about one kind of unfinished business - the stage
 * gate, the raised conditions, the access register, the asset register, the
 * review cycles and the intake itself. None of them knows about the others,
 * which is correct: each is the authority on its own subject.
 *
 * What nobody had was the union. A project manager asking the only question
 * that matters on an onboarding call - what are we still waiting for - had to
 * open six tabs and hold the answer in their head. This assembles that list,
 * and it assembles it rather than storing it: an outstanding-items table would
 * be a seventh place for the same facts to be wrong in.
 *
 * Note what is deliberately absent. Nothing here decides whether a client is
 * "waiting on client" - that is derived from the same items downstream, so the
 * badge and the list can never disagree.
 */

import { blocksStage, dependencyStatus, type RaisedCondition } from "@/lib/journey/dependency";
import type { OutstandingItem } from "@/lib/journey/onboarding-focus";
import type { IntakeSnapshot } from "@/lib/journey/onboarding-focus";

/** A stage-gate requirement, as the gate already reports it. */
export interface RequirementRow {
  key: string;
  label: string;
  isBlocking: boolean;
  satisfied: boolean;
  /** The seat responsible. Client-owned requirements are chased differently. */
  owner: string;
}

/** One raised condition, with the contact it was raised against. */
export interface FlagRow extends RaisedCondition {
  id: string;
  reason: string;
  detail: string | null;
  contactId: string | null;
  requirementKey: string | null;
}

export interface AccessRow {
  id: string;
  label: string;
  status: string;
  isCritical: boolean;
  requestedAt: string | null;
}

export interface AssetRow {
  id: string;
  name: string;
  status: string;
  isRequired: boolean;
  requestedAt: string | null;
}

export interface ApprovalRow {
  id: string;
  label: string;
  status: string;
  sentAt: string | null;
  feedbackDeadline: string | null;
  approverContactId: string | null;
}

/** Access states that mean somebody can actually get in. */
const ACCESS_USABLE = new Set(["GRANTED", "TESTED", "NOT_APPLICABLE"]);
/** Asset states that mean the file is in hand. */
const ASSET_IN_HAND = new Set(["RECEIVED", "APPROVED", "NOT_APPLICABLE"]);

/**
 * Requirement owners the client is responsible for.
 *
 * The gate records who has to act, and "the client" is one of the answers. It
 * matters here because a requirement the agency owes itself does not belong in
 * a list of people to chase.
 */
const CLIENT_OWNED_REQUIREMENT_OWNERS = new Set(["CLIENT"]);

const iso = (value: string | Date | null | undefined) =>
  value === null || value === undefined ? null : new Date(value).toISOString();

function isOverdue(dueAt: string | null, now: Date) {
  return dueAt !== null && new Date(dueAt).getTime() < now.getTime();
}

export interface ReadinessInput {
  requirements: RequirementRow[];
  flags: FlagRow[];
  access: AccessRow[];
  assets: AssetRow[];
  approvals: ApprovalRow[];
  intake: IntakeSnapshot;
  /** Null when A2P is not in play for this client. */
  a2p: { missing: { label: string }[] } | null;
  /**
   * Whether the intake still counts as outstanding.
   *
   * Once a form is reviewed, its unanswered optional questions are not work in
   * progress - somebody looked at the answers and accepted them. Chasing a
   * client for a question the agency has already signed off is how a chase
   * list loses its credibility.
   */
  countIntakeAnswers: boolean;
  now: Date;
}

/**
 * The union, in no particular order.
 *
 * Sorting is the caller's business: the chase drawer wants urgency order and
 * the readiness summary wants counts, and baking one of those in here would
 * make the other re-sort what it was given.
 */
export function collectOutstanding(input: ReadinessInput): OutstandingItem[] {
  const { now } = input;
  const items: OutstandingItem[] = [];

  /*
   * Requirements the gate says are unmet.
   *
   * Taken from the same evaluation the stage gate runs, not a second copy of
   * the rules - so the card can never claim a client is ready for a stage the
   * gate will refuse, which is the failure mode that makes people override.
   */
  for (const requirement of input.requirements) {
    if (requirement.satisfied) continue;

    items.push({
      key: `requirement:${requirement.key}`,
      label: requirement.label,
      category: "requirement",
      blocking: requirement.isBlocking,
      clientOwned: CLIENT_OWNED_REQUIREMENT_OWNERS.has(requirement.owner),
      dueAt: null,
      overdue: false,
      contactId: null,
      recordId: null,
      requestedAt: null,
      lastFollowUpAt: null,
      followUpCount: 0,
      received: false,
    });
  }

  /*
   * Raised conditions.
   *
   * These carry the chasing history - who was asked, how often, when last -
   * which is why they are the only category with real follow-up buttons behind
   * them. The others can be chased, but there is nowhere to record it.
   */
  for (const flag of input.flags) {
    const status = dependencyStatus(flag, now);

    if (status === "RESOLVED" || status === "CANCELLED") continue;

    items.push({
      key: `flag:${flag.id}`,
      label: flag.reason,
      category: "dependency",
      blocking: blocksStage(flag),
      clientOwned: flag.kind === "WAITING_ON_CLIENT" || flag.contactId !== null,
      dueAt: iso(flag.dueAt),
      overdue: status === "OVERDUE",
      contactId: flag.contactId,
      recordId: flag.id,
      requestedAt: iso(flag.raisedAt),
      lastFollowUpAt: iso(flag.lastFollowUpAt),
      followUpCount: flag.followUpCount,
      received: status === "RECEIVED",
    });
  }

  /* Approvals the client has been asked for and not given. */
  for (const approval of input.approvals) {
    items.push({
      key: `approval:${approval.id}`,
      label: approval.label,
      category: "approval",
      // An approval the client owes always holds the work it approves.
      blocking: true,
      clientOwned: true,
      dueAt: approval.feedbackDeadline,
      overdue: isOverdue(approval.feedbackDeadline, now),
      contactId: approval.approverContactId,
      recordId: approval.id,
      requestedAt: approval.sentAt,
      lastFollowUpAt: null,
      followUpCount: 0,
      received: false,
    });
  }

  /* Platform access nobody can get into yet. */
  for (const record of input.access) {
    if (ACCESS_USABLE.has(record.status)) continue;

    items.push({
      key: `access:${record.id}`,
      label: record.label,
      category: "access",
      blocking: record.isCritical,
      clientOwned: true,
      dueAt: null,
      overdue: false,
      contactId: null,
      recordId: record.id,
      requestedAt: record.requestedAt,
      lastFollowUpAt: null,
      followUpCount: 0,
      // Requested-but-not-granted is the client's move to make.
      received: false,
    });
  }

  /* Brand assets the work cannot be produced without. */
  for (const record of input.assets) {
    if (ASSET_IN_HAND.has(record.status)) continue;

    items.push({
      key: `asset:${record.id}`,
      label: record.name,
      category: "asset",
      blocking: record.isRequired,
      clientOwned: true,
      dueAt: null,
      overdue: false,
      contactId: null,
      recordId: record.id,
      requestedAt: record.requestedAt,
      lastFollowUpAt: null,
      followUpCount: 0,
      received: false,
    });
  }

  /* Required intake questions with nothing in them. */
  if (input.countIntakeAnswers) {
    for (const answer of input.intake.missingRequired) {
      items.push({
        key: `intake:${answer.questionId}`,
        label: answer.label,
        category: "intake",
        // Required, so it holds the form - but the form is not the stage gate.
        blocking: false,
        clientOwned: true,
        dueAt: null,
        overdue: false,
        contactId: null,
        recordId: null,
        requestedAt: input.intake.sentAt,
        lastFollowUpAt: null,
        followUpCount: 0,
        received: false,
      });
    }
  }

  /*
   * A2P, where it is in play at all.
   *
   * Never blocking. A2P registration is a carrier process running alongside
   * delivery, and a client who bought a website and happens to want texting
   * later should not have their build held up by a messaging form.
   */
  if (input.a2p) {
    for (const missing of input.a2p.missing) {
      items.push({
        key: `a2p:${missing.label}`,
        label: missing.label,
        category: "a2p",
        blocking: false,
        clientOwned: true,
        dueAt: null,
        overdue: false,
        contactId: null,
        recordId: null,
        requestedAt: null,
        lastFollowUpAt: null,
        followUpCount: 0,
        received: false,
      });
    }
  }

  return items;
}

/**
 * Whether the agency is waiting on the client, from the items themselves.
 *
 * Derived rather than flagged. A badge somebody sets by hand outlives the
 * thing it was set for: the client sends the logo, nobody clears the badge,
 * and the account reads as stuck for a fortnight. This cannot, because there
 * is nothing to clear - the badge disappears when the last item does.
 */
export function waitingOnClient(items: OutstandingItem[]): boolean {
  return items.some((item) => item.clientOwned && !item.received);
}
