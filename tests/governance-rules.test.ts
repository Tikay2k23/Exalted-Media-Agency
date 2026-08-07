import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type ResolvableFinding,
  findingNeedsAction,
  isCorrectiveActionOpen,
  isCorrectiveActionOverdue,
  unresolvedCriticalFindings,
} from "@/lib/governance/audit-service";
import { isSopReviewOverdue, nextVersion } from "@/lib/governance/sop-service";
import {
  type CertifiableRecord,
  certificationBlocksRestrictedWork,
  certificationState,
} from "@/lib/governance/training-service";

const now = new Date("2026-08-08T12:00:00.000Z");

function daysFromNow(days: number) {
  return new Date(now.getTime() + days * 86_400_000);
}

describe("SOP versioning", () => {
  it("bumps the minor version", () => {
    assert.equal(nextVersion("1.0"), "1.1");
    assert.equal(nextVersion("2.9"), "2.10");
  });

  it("falls back to 1.0 for anything it cannot parse", () => {
    // A version label is for humans. Garbage in should not produce NaN.
    assert.equal(nextVersion(""), "1.0");
    assert.equal(nextVersion("draft"), "1.0");
    assert.equal(nextVersion("1.0.3"), "1.0");
  });
});

describe("SOP review dates", () => {
  it("only nags about active procedures", () => {
    // A draft nobody has approved is not overdue for review, it is unfinished.
    assert.equal(
      isSopReviewOverdue(
        { status: "DRAFT", nextReviewAt: daysFromNow(-100), lastReviewedAt: null },
        now,
      ),
      false,
    );
  });

  it("flags an active procedure past its review date", () => {
    assert.equal(
      isSopReviewOverdue(
        { status: "ACTIVE", nextReviewAt: daysFromNow(-1), lastReviewedAt: daysFromNow(-400) },
        now,
      ),
      true,
    );
  });

  it("is quiet while the review is still ahead", () => {
    assert.equal(
      isSopReviewOverdue(
        { status: "ACTIVE", nextReviewAt: daysFromNow(30), lastReviewedAt: now },
        now,
      ),
      false,
    );
  });

  it("does not invent a review date that was never set", () => {
    assert.equal(
      isSopReviewOverdue({ status: "ACTIVE", nextReviewAt: null, lastReviewedAt: null }, now),
      false,
    );
  });
});

function finding(overrides: Partial<ResolvableFinding> = {}): ResolvableFinding {
  return {
    title: "Onboarding form not sent within 24 hours",
    result: "NON_COMPLIANT",
    isCritical: false,
    correctiveActions: [],
    ...overrides,
  };
}

describe("which findings demand a corrective action", () => {
  it("treats an explicit critical flag as demanding one", () => {
    assert.equal(findingNeedsAction(finding({ isCritical: true })), true);
  });

  it("treats a critical failure result as demanding one even without the flag", () => {
    // Otherwise the flag and the result could disagree and the softer one wins.
    assert.equal(findingNeedsAction(finding({ result: "CRITICAL_FAILURE" })), true);
  });

  it("does not demand one for an ordinary non-compliance", () => {
    assert.equal(findingNeedsAction(finding()), false);
  });

  it("lists critical findings with nothing being done", () => {
    const unresolved = unresolvedCriticalFindings([
      finding({ isCritical: true }),
      finding({ title: "Second", isCritical: true, correctiveActions: [{ status: "OPEN" }] }),
      finding({ title: "Third" }),
    ]);

    assert.equal(unresolved.length, 1);
  });

  it("counts an open corrective action as being done about it", () => {
    // The point is that somebody owns it, not that it is finished - an audit
    // that waited for closure would stay open for weeks.
    assert.deepEqual(
      unresolvedCriticalFindings([
        finding({ isCritical: true, correctiveActions: [{ status: "IN_PROGRESS" }] }),
      ]),
      [],
    );
  });
});

describe("corrective action states", () => {
  it("treats open, in progress, awaiting verification and overdue as open", () => {
    for (const status of [
      "OPEN",
      "IN_PROGRESS",
      "AWAITING_VERIFICATION",
      "OVERDUE",
    ] as const) {
      assert.equal(isCorrectiveActionOpen(status), true, status);
    }
  });

  it("treats verified and closed as done", () => {
    assert.equal(isCorrectiveActionOpen("VERIFIED"), false);
    assert.equal(isCorrectiveActionOpen("CLOSED"), false);
  });

  it("is overdue only when open and past the date", () => {
    assert.equal(
      isCorrectiveActionOverdue({ status: "OPEN", dueDate: daysFromNow(-1) }, now),
      true,
    );
    assert.equal(
      isCorrectiveActionOverdue({ status: "OPEN", dueDate: daysFromNow(1) }, now),
      false,
    );
    // A closed action that missed its date is history, not a live problem.
    assert.equal(
      isCorrectiveActionOverdue({ status: "CLOSED", dueDate: daysFromNow(-30) }, now),
      false,
    );
    assert.equal(isCorrectiveActionOverdue({ status: "OPEN", dueDate: null }, now), false);
  });
});

function record(overrides: Partial<CertifiableRecord> = {}): CertifiableRecord {
  return {
    certificationAwarded: "CERTIFIED_OPERATOR",
    certificationExpiresAt: daysFromNow(200),
    status: "COMPLETED",
    ...overrides,
  };
}

describe("certification state", () => {
  it("reports none when nobody has been certified", () => {
    assert.equal(certificationState([], now), "none");
    assert.equal(
      certificationState([record({ certificationAwarded: null })], now),
      "none",
    );
  });

  it("reports current when the certification is comfortably live", () => {
    assert.equal(certificationState([record()], now), "current");
  });

  it("reports expiring inside the warning window", () => {
    assert.equal(
      certificationState([record({ certificationExpiresAt: daysFromNow(10) })], now),
      "expiring",
    );
  });

  it("reports expired once every certification has lapsed", () => {
    assert.equal(
      certificationState([record({ certificationExpiresAt: daysFromNow(-1) })], now),
      "expired",
    );
  });

  it("treats a certification with no expiry as one that does not lapse", () => {
    assert.equal(
      certificationState([record({ certificationExpiresAt: null })], now),
      "current",
    );
  });

  it("keeps somebody current while any one certification is still live", () => {
    assert.equal(
      certificationState(
        [
          record({ certificationExpiresAt: daysFromNow(-30) }),
          record({ certificationExpiresAt: daysFromNow(300) }),
        ],
        now,
      ),
      "current",
    );
  });

  it("ignores waived records when deciding", () => {
    // A waiver is a decision that the course does not apply, not a lapse.
    assert.equal(
      certificationState(
        [record({ status: "WAIVED", certificationExpiresAt: daysFromNow(-1) })],
        now,
      ),
      "none",
    );
  });
});

describe("what blocks restricted work", () => {
  it("blocks only an outright lapse", () => {
    assert.equal(certificationBlocksRestrictedWork("expired"), true);
  });

  it("does not block somebody who was never certified", () => {
    // The rule arms itself when the agency starts certifying. Freezing six
    // people's work on an empty table would be a bug, not a control.
    assert.equal(certificationBlocksRestrictedWork("none"), false);
  });

  it("does not block on a warning", () => {
    // Locking somebody out a month early just teaches people to work around it.
    assert.equal(certificationBlocksRestrictedWork("expiring"), false);
    assert.equal(certificationBlocksRestrictedWork("current"), false);
  });
});
