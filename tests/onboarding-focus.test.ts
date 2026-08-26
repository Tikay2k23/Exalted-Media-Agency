import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_INTAKE,
  intakeStateOf,
  onboardingFocus,
  outstandingPriority,
  sortOutstanding,
  summariseOutstanding,
  type IntakeSnapshot,
  type OutstandingItem,
} from "@/lib/journey/onboarding-focus";
import {
  collectOutstanding,
  waitingOnClient,
  type ReadinessInput,
} from "@/lib/journey/onboarding-readiness";
import { contactsToChase, type ChaseContact } from "@/lib/journey/contacts-to-chase";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const day = (offset: number) =>
  new Date(NOW.getTime() + offset * 86_400_000).toISOString();

function intake(overrides: Partial<IntakeSnapshot> = {}): IntakeSnapshot {
  return { ...EMPTY_INTAKE, ...overrides };
}

function item(overrides: Partial<OutstandingItem> = {}): OutstandingItem {
  return {
    key: "x",
    label: "Something",
    category: "dependency",
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
    ...overrides,
  };
}

function focusFor(
  snapshot: IntakeSnapshot,
  outstanding: OutstandingItem[] = [],
  a2p: { percent: number; complete: number; total: number; headline: string } | null = null,
) {
  return onboardingFocus({
    intake: snapshot,
    outstanding,
    a2p,
    stageName: "Onboarding",
    nextStageName: "Access & Assets",
    nextMilestone: { name: "Kickoff call", dueAt: day(3), owner: "Aileen" },
    now: NOW,
  });
}

/**
 * The seven states.
 *
 * Derived from timestamps rather than the status column, so a row whose status
 * was left behind by a failed write still reads correctly.
 */
describe("intake state", () => {
  it("is not sent when there is no form, or no send", () => {
    assert.equal(intakeStateOf(intake()), "NOT_SENT");
    assert.equal(intakeStateOf(intake({ exists: true })), "NOT_SENT");
  });

  it("walks forward through sent, opened, in progress, submitted, reviewed", () => {
    const sent = intake({ exists: true, sentAt: day(-4) });

    assert.equal(intakeStateOf(sent), "SENT");
    assert.equal(intakeStateOf({ ...sent, viewedAt: day(-3) }), "OPENED");
    assert.equal(
      intakeStateOf({ ...sent, viewedAt: day(-3), lastSavedAt: day(-2) }),
      "IN_PROGRESS",
    );
    assert.equal(intakeStateOf({ ...sent, submittedAt: day(-1) }), "SUBMITTED");
    assert.equal(
      intakeStateOf({ ...sent, submittedAt: day(-1), reviewedAt: day(0) }),
      "REVIEWED",
    );
  });

  it("counts answers as progress even when nothing recorded a save", () => {
    // A form filled in one sitting can submit without an autosave landing.
    assert.equal(
      intakeStateOf(intake({ exists: true, sentAt: day(-2), answered: 6 })),
      "IN_PROGRESS",
    );
  });

  it("reads a reopened form as in progress, not as submitted", () => {
    /*
     * Reopening clears submittedAt on purpose - that is what lets the client
     * back in. If this returned SUBMITTED the card would ask somebody to
     * review a form the client is still editing.
     */
    const reopened = intake({
      exists: true,
      status: "REOPENED",
      sentAt: day(-10),
      viewedAt: day(-9),
      lastSavedAt: day(-8),
      submittedAt: null,
      reopenedAt: day(-1),
      answered: 12,
    });

    assert.equal(intakeStateOf(reopened), "IN_PROGRESS");
  });
});

/**
 * The contradiction this whole module exists to kill.
 *
 * A reviewed intake being told to go and get the intake completed was the
 * reported bug. These are the assertions that fail if it ever comes back.
 */
describe("focus card", () => {
  it("never tells the PM to chase a form that has been reviewed", () => {
    const reviewed = intake({
      exists: true,
      sentAt: day(-20),
      submittedAt: day(-3),
      reviewedAt: day(-1),
      percent: 100,
    });

    for (const outstanding of [[], [item({ category: "access", label: "Meta Business Manager" })]]) {
      const result = focusFor(reviewed, outstanding);

      assert.doesNotMatch(result.description, /get the intake form/i);
      assert.doesNotMatch(result.description, /send/i);
      assert.equal(result.intakeState === "REVIEWED" || result.intakeState === "COMPLETE", true);
    }
  });

  it("sends the PM to Strategy, and offers no send button of its own", () => {
    const result = focusFor(intake());

    assert.equal(result.focus, "SEND_INTAKE");
    assert.equal(result.title, "Focus: Send Intake");

    const keys = result.actions.map((action) => action.key);

    assert.deepEqual(keys, ["go-to-strategy", "preview-intake"]);
    // The one send path in the application stays in Strategy.
    assert.equal(
      result.actions.some((action) => /send intake/i.test(action.label)),
      false,
    );
  });

  it("asks for completion while the client still has the form", () => {
    const result = focusFor(intake({ exists: true, sentAt: day(-6), viewedAt: day(-5), percent: 62 }));

    assert.equal(result.focus, "INTAKE_COMPLETION");
    assert.equal(result.facts.find((fact) => fact.label === "Completion")?.value, "62%");
    assert.deepEqual(
      result.actions.map((action) => action.key),
      ["open-onboarding-form", "contacts-to-chase"],
    );
  });

  it("asks for a review once it is submitted", () => {
    const result = focusFor(
      intake({ exists: true, sentAt: day(-9), submittedAt: day(-1), percent: 100 }),
    );

    assert.equal(result.focus, "INTAKE_REVIEW");
    assert.equal(result.actions[0].key, "review-intake");
  });

  it("offers View Missing Information only when something is missing", () => {
    const base = { exists: true, sentAt: day(-9), submittedAt: day(-1), percent: 92 };
    const withMissing = focusFor(
      intake({
        ...base,
        missingRequired: [
          { questionId: "ein", label: "Tax ID", sectionId: "business", sectionTitle: "Your business" },
        ],
      }),
    );
    const without = focusFor(intake({ ...base, percent: 100 }));

    assert.equal(
      withMissing.actions.some((action) => action.key === "view-missing-information"),
      true,
    );
    assert.equal(
      without.actions.some((action) => action.key === "view-missing-information"),
      false,
    );
  });

  /* Section 46: readiness overrides status once the form has been read. */
  it("switches to readiness when a reviewed intake still has work behind it", () => {
    const reviewed = intake({
      exists: true,
      sentAt: day(-20),
      submittedAt: day(-3),
      reviewedAt: day(-1),
      percent: 100,
    });

    const result = focusFor(reviewed, [
      item({ key: "a", category: "access", label: "Meta Business Manager" }),
      item({ key: "b", category: "asset", label: "Logo" }),
      item({ key: "c", category: "dependency", label: "Business address" }),
    ]);

    assert.equal(result.focus, "ONBOARDING_READINESS");
    assert.equal(result.statusLabel, "Intake Reviewed");
    assert.equal(result.actions[0].key, "view-requirements");
  });

  it("moves to the next milestone when nothing is left", () => {
    const result = focusFor(
      intake({
        exists: true,
        sentAt: day(-20),
        submittedAt: day(-3),
        reviewedAt: day(-1),
        percent: 100,
      }),
      [],
    );

    assert.equal(result.focus, "NEXT_MILESTONE");
    assert.equal(result.intakeState, "COMPLETE");
    assert.equal(result.facts.find((fact) => fact.label === "Next milestone")?.value, "Kickoff call");
    assert.deepEqual(
      result.actions.map((action) => action.key),
      ["view-journey"],
    );
  });

  it("drops the chase button when everything left is the agency's own work", () => {
    const result = focusFor(
      intake({ exists: true, sentAt: day(-20), submittedAt: day(-3), reviewedAt: day(-1) }),
      [item({ category: "requirement", label: "Project manager assigned", clientOwned: false })],
    );

    assert.equal(result.focus, "ONBOARDING_READINESS");
    assert.equal(
      result.actions.some((action) => action.key === "contacts-to-chase"),
      false,
    );
  });

  it("shows A2P readiness only where A2P is in play", () => {
    const submitted = intake({ exists: true, sentAt: day(-9), submittedAt: day(-1) });

    const without = focusFor(submitted);
    const withA2p = focusFor(submitted, [], {
      percent: 78,
      complete: 18,
      total: 22,
      headline: "Needs review",
    });

    assert.equal(without.facts.some((fact) => /a2p/i.test(fact.label)), false);
    assert.equal(
      withA2p.facts.find((fact) => /a2p/i.test(fact.label))?.value,
      "18 of 22 items",
    );
  });

  it("never claims a registration is approved or compliant", () => {
    const result = focusFor(
      intake({ exists: true, sentAt: day(-9), submittedAt: day(-1) }),
      [],
      { percent: 100, complete: 22, total: 22, headline: "Ready to submit" },
    );

    const text = JSON.stringify(result);

    assert.doesNotMatch(text, /guaranteed/i);
    assert.doesNotMatch(text, /approved/i);
    assert.doesNotMatch(text, /compliant/i);
  });
});

/**
 * Chase order.
 *
 * Section 47. The properties that cost a date sort first, and the categories
 * sort in the order work actually stops in.
 */
describe("outstanding priority", () => {
  it("puts overdue blocking work above everything", () => {
    const worst = item({ category: "requirement", blocking: true, overdue: true });
    const rest = [
      item({ category: "dependency", blocking: true, overdue: true }),
      item({ category: "approval", overdue: true }),
      item({ category: "access", blocking: true }),
      item({ category: "intake" }),
    ];

    for (const other of rest) {
      assert.ok(
        outstandingPriority(worst) < outstandingPriority(other),
        `${other.category} should sort below an overdue blocking requirement`,
      );
    }
  });

  it("ranks overdue above blocking, because a date is already lost", () => {
    assert.ok(
      outstandingPriority(item({ category: "a2p", overdue: true }))
        < outstandingPriority(item({ category: "requirement", blocking: true })),
    );
  });

  it("breaks ties by age, oldest first", () => {
    const sorted = sortOutstanding([
      item({ key: "new", label: "New", requestedAt: day(-1) }),
      item({ key: "old", label: "Old", requestedAt: day(-30) }),
    ]);

    assert.deepEqual(sorted.map((entry) => entry.key), ["old", "new"]);
  });

  it("does not mutate what it was given", () => {
    const input = [item({ key: "b", requestedAt: day(-1) }), item({ key: "a", requestedAt: day(-9) })];
    const before = input.map((entry) => entry.key);

    sortOutstanding(input);

    assert.deepEqual(input.map((entry) => entry.key), before);
  });
});

/* -------------------------------------------------------------------------- */

function readiness(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    requirements: [],
    flags: [],
    access: [],
    assets: [],
    approvals: [],
    intake: intake(),
    a2p: null,
    countIntakeAnswers: true,
    now: NOW,
    ...overrides,
  };
}

describe("collecting what is outstanding", () => {
  it("ignores requirements the gate says are met", () => {
    const items = collectOutstanding(
      readiness({
        requirements: [
          { key: "pm", label: "PM assigned", isBlocking: true, satisfied: true, owner: "PROJECT_MANAGER" },
          { key: "intake", label: "Intake reviewed", isBlocking: true, satisfied: false, owner: "CLIENT" },
        ],
      }),
    );

    assert.deepEqual(items.map((entry) => entry.label), ["Intake reviewed"]);
    assert.equal(items[0].clientOwned, true);
  });

  it("leaves resolved and cancelled conditions out", () => {
    const base = {
      kind: "WAITING_ON_CLIENT",
      dueAt: null,
      raisedAt: day(-5),
      lastFollowUpAt: null,
      followUpCount: 0,
      receivedAt: null,
      resolvedAt: null,
      cancelledAt: null,
      severity: null,
      impact: null,
      expectedResolutionAt: null,
      detail: null,
      contactId: null,
      requirementKey: null,
    };

    const items = collectOutstanding(
      readiness({
        flags: [
          { ...base, id: "1", reason: "Open" },
          { ...base, id: "2", reason: "Done", resolvedAt: day(-1) },
          { ...base, id: "3", reason: "Dropped", cancelledAt: day(-1) },
        ],
      }),
    );

    assert.deepEqual(items.map((entry) => entry.label), ["Open"]);
  });

  it("keeps a received-but-unchecked condition open", () => {
    // Their move is made; ours is not. It stays on the list, not as a chase.
    const items = collectOutstanding(
      readiness({
        flags: [
          {
            id: "1",
            reason: "Business address",
            detail: null,
            contactId: null,
            requirementKey: null,
            kind: "WAITING_ON_CLIENT",
            dueAt: null,
            raisedAt: day(-5),
            lastFollowUpAt: null,
            followUpCount: 0,
            receivedAt: day(-1),
            resolvedAt: null,
            cancelledAt: null,
            severity: null,
            impact: null,
            expectedResolutionAt: null,
          },
        ],
      }),
    );

    assert.equal(items.length, 1);
    assert.equal(items[0].received, true);
    assert.equal(waitingOnClient(items), false);
  });

  it("counts only access nobody can get into", () => {
    const items = collectOutstanding(
      readiness({
        access: [
          { id: "1", label: "Meta", status: "PENDING_CLIENT", isCritical: true, requestedAt: day(-3) },
          { id: "2", label: "Google Ads", status: "GRANTED", isCritical: true, requestedAt: day(-9) },
          { id: "3", label: "Old CMS", status: "NOT_APPLICABLE", isCritical: false, requestedAt: null },
        ],
      }),
    );

    assert.deepEqual(items.map((entry) => entry.label), ["Meta"]);
    assert.equal(items[0].blocking, true);
  });

  it("counts only assets not yet in hand", () => {
    const items = collectOutstanding(
      readiness({
        assets: [
          { id: "1", name: "Logo", status: "REQUESTED", isRequired: true, requestedAt: day(-3) },
          { id: "2", name: "Photos", status: "APPROVED", isRequired: true, requestedAt: day(-9) },
        ],
      }),
    );

    assert.deepEqual(items.map((entry) => entry.label), ["Logo"]);
  });

  it("stops chasing intake answers once somebody has reviewed them", () => {
    const missing = [
      { questionId: "ein", label: "Tax ID", sectionId: "business", sectionTitle: "Your business" },
    ];

    const before = collectOutstanding(
      readiness({ intake: intake({ missingRequired: missing }), countIntakeAnswers: true }),
    );
    const after = collectOutstanding(
      readiness({ intake: intake({ missingRequired: missing }), countIntakeAnswers: false }),
    );

    assert.equal(before.length, 1);
    assert.equal(after.length, 0);
  });

  it("never lets A2P block a stage", () => {
    const items = collectOutstanding(
      readiness({ a2p: { missing: [{ label: "Sample messages" }, { label: "Privacy policy" }] } }),
    );

    assert.equal(items.length, 2);
    assert.equal(items.every((entry) => !entry.blocking), true);
  });
});

/* -------------------------------------------------------------------------- */

const CONTACTS: ChaseContact[] = [
  {
    id: "tom",
    name: "Tom Brennan",
    email: "tom@example.com",
    phone: "+1 555 0100",
    role: "Owner",
    isPrimary: true,
    isApprover: false,
  },
  {
    id: "emily",
    name: "Emily Davis",
    email: "emily@example.com",
    phone: null,
    role: "Marketing",
    isPrimary: false,
    isApprover: true,
  },
];

describe("contacts to chase", () => {
  it("lists nobody when nothing is outstanding", () => {
    assert.deepEqual(contactsToChase([], CONTACTS, NOW), []);
  });

  it("does not list a contact who owes nothing", () => {
    const groups = contactsToChase(
      [item({ key: "1", label: "Strategy approval", contactId: "emily" })],
      CONTACTS,
      NOW,
    );

    assert.deepEqual(groups.map((group) => group.contact?.id), ["emily"]);
  });

  it("leaves the agency's own work off the chase list entirely", () => {
    const groups = contactsToChase(
      [item({ key: "1", label: "Write the brief", clientOwned: false, contactId: "tom" })],
      CONTACTS,
      NOW,
    );

    assert.deepEqual(groups, []);
  });

  it("puts unattributed client work on the primary contact, and says so", () => {
    const groups = contactsToChase(
      [item({ key: "1", label: "Meta Business Manager", category: "access" })],
      CONTACTS,
      NOW,
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0].contact?.id, "tom");
    assert.equal(groups[0].byDefault, true);
  });

  it("merges a contact's own items with the ones that defaulted to them", () => {
    const groups = contactsToChase(
      [
        item({ key: "1", label: "Business address", contactId: "tom" }),
        item({ key: "2", label: "Meta access", category: "access" }),
      ],
      CONTACTS,
      NOW,
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0].items.length, 2);
  });

  it("ranks people by their worst item, not by how many they have", () => {
    const groups = contactsToChase(
      [
        item({ key: "1", label: "Optional note", category: "intake", contactId: "tom" }),
        item({ key: "2", label: "Another", category: "intake", contactId: "tom" }),
        item({ key: "3", label: "Extra", category: "intake", contactId: "tom" }),
        item({
          key: "4",
          label: "Strategy approval",
          category: "approval",
          blocking: true,
          overdue: true,
          contactId: "emily",
        }),
      ],
      CONTACTS,
      NOW,
    );

    assert.deepEqual(groups.map((group) => group.contact?.id), ["emily", "tom"]);
  });

  it("adds up the chasing history across a contact's items", () => {
    const groups = contactsToChase(
      [
        item({ key: "1", contactId: "tom", requestedAt: day(-14), lastFollowUpAt: day(-2), followUpCount: 2 }),
        item({ key: "2", contactId: "tom", requestedAt: day(-3), lastFollowUpAt: day(-1), followUpCount: 1 }),
      ],
      CONTACTS,
      NOW,
    );

    assert.equal(groups[0].followUpCount, 3);
    assert.equal(groups[0].daysWaiting, 14);
    assert.equal(groups[0].lastFollowUpAt, day(-1));
  });

  it("survives an account with no contacts on file", () => {
    const groups = contactsToChase([item({ key: "1", label: "Logo", category: "asset" })], [], NOW);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].contact, null);
  });
});

describe("waiting on client", () => {
  it("is true while the client owes something nobody has received", () => {
    assert.equal(waitingOnClient([item({ clientOwned: true })]), true);
  });

  it("clears itself when the last client item is answered", () => {
    assert.equal(waitingOnClient([item({ clientOwned: true, received: true })]), false);
  });

  it("ignores the agency's own outstanding work", () => {
    assert.equal(waitingOnClient([item({ clientOwned: false })]), false);
  });
});

describe("summarising", () => {
  it("counts by category, blocking and overdue independently", () => {
    const summary = summariseOutstanding([
      item({ category: "access", blocking: true }),
      item({ category: "access" }),
      item({ category: "approval", overdue: true, blocking: true }),
    ]);

    assert.equal(summary.total, 3);
    assert.equal(summary.byCategory.access, 2);
    assert.equal(summary.blocking, 2);
    assert.equal(summary.overdue, 1);
  });
});
