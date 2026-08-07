import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLIENT_APPROVAL_TYPES,
  type VerifiableApproval,
  describeApprovalShortfall,
  hasGateSatisfyingApproval,
  isVerifiableApproval,
} from "@/lib/approvals/approval-service";

function approval(overrides: Partial<VerifiableApproval> = {}): VerifiableApproval {
  return {
    type: "DELIVERABLE",
    status: "RECORDED",
    approvedByName: "Maria Santos",
    evidenceUrl: "https://mail.example.test/thread/9",
    notes: null,
    ...overrides,
  };
}

describe("what makes a client approval usable", () => {
  it("accepts a recorded approval with a named approver and a link", () => {
    assert.equal(isVerifiableApproval(approval()), true);
    assert.deepEqual(describeApprovalShortfall(approval()), []);
  });

  it("accepts a written account instead of a link", () => {
    // Plenty of approvals happen on a call. What matters is that somebody
    // wrote down how it was given, not that a URL exists.
    const verbal = approval({
      evidenceUrl: null,
      notes: "Approved on a call with Maria on 6 Aug; summary emailed the same day.",
    });

    assert.equal(isVerifiableApproval(verbal), true);
  });

  it("rejects an approval with no evidence at all", () => {
    const bare = approval({ evidenceUrl: null, notes: null });

    assert.equal(isVerifiableApproval(bare), false);
    assert.ok(describeApprovalShortfall(bare).some((item) => /evidence/i.test(item)));
  });

  it("rejects an approval that names nobody", () => {
    const anonymous = approval({ approvedByName: null });

    assert.equal(isVerifiableApproval(anonymous), false);
    assert.ok(describeApprovalShortfall(anonymous).some((item) => /nobody/i.test(item)));
  });

  it("does not accept whitespace as a name or as evidence", () => {
    assert.equal(isVerifiableApproval(approval({ approvedByName: "   " })), false);
    assert.equal(
      isVerifiableApproval(approval({ evidenceUrl: "  ", notes: "\n\t" })),
      false,
    );
  });

  it("stops counting an approval once it is withdrawn", () => {
    const withdrawn = approval({ status: "WITHDRAWN" });

    assert.equal(isVerifiableApproval(withdrawn), false);
    assert.ok(describeApprovalShortfall(withdrawn).some((item) => /withdrawn/i.test(item)));
  });

  it("reports every reason at once rather than the first", () => {
    // Somebody fixing this should not have to submit three times to discover
    // three problems.
    const reasons = describeApprovalShortfall(
      approval({ status: "WITHDRAWN", approvedByName: null, evidenceUrl: null, notes: null }),
    );

    assert.equal(reasons.length, 3);
  });
});

describe("which approvals open the launch gate", () => {
  it("accepts a deliverable sign-off", () => {
    assert.equal(hasGateSatisfyingApproval([approval({ type: "DELIVERABLE" })]), true);
  });

  it("accepts a final sign-off", () => {
    assert.equal(hasGateSatisfyingApproval([approval({ type: "FINAL_SIGN_OFF" })]), true);
  });

  it("does not accept a strategy brief approval", () => {
    // That one is internal - one teammate agreeing with another. Letting it
    // open the launch gate would mean the client never had to see the work.
    assert.equal(hasGateSatisfyingApproval([approval({ type: "STRATEGY_BRIEF" })]), false);
  });

  it("does not accept a scope change or a launch approval on its own", () => {
    assert.equal(hasGateSatisfyingApproval([approval({ type: "SCOPE_CHANGE" })]), false);
    assert.equal(hasGateSatisfyingApproval([approval({ type: "LAUNCH" })]), false);
  });

  it("is unmoved by a pile of unusable approvals", () => {
    assert.equal(
      hasGateSatisfyingApproval([
        approval({ status: "WITHDRAWN" }),
        approval({ approvedByName: null }),
        approval({ evidenceUrl: null, notes: null }),
        approval({ type: "STRATEGY_BRIEF" }),
      ]),
      false,
    );
  });

  it("passes as soon as one good approval sits among bad ones", () => {
    assert.equal(
      hasGateSatisfyingApproval([approval({ status: "WITHDRAWN" }), approval()]),
      true,
    );
  });

  it("treats an empty register as unapproved", () => {
    assert.equal(hasGateSatisfyingApproval([]), false);
  });
});

describe("the approval types offered on the screen", () => {
  it("does not offer the internal strategy brief approval", () => {
    // Offering it here would invite somebody to record a client sign-off that
    // never happened.
    assert.ok(
      CLIENT_APPROVAL_TYPES.every((option) => option.value !== "STRATEGY_BRIEF"),
    );
  });

  it("offers the two that open the launch gate", () => {
    const values = CLIENT_APPROVAL_TYPES.map((option) => option.value);

    assert.ok(values.includes("DELIVERABLE"));
    assert.ok(values.includes("FINAL_SIGN_OFF"));
  });
});
