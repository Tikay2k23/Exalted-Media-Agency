import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type AccountHealthInput,
  accountHealth,
} from "@/lib/success/account-health";

const base = (overrides: Partial<AccountHealthInput> = {}): AccountHealthInput => ({
  journey: { score: 90, label: "On Track" },
  approvals: { score: 100, blockers: [] },
  delivery: { total: 10, overdue: 0, blocked: 0 },
  performance: { reportsDue: 4, reportsOverdue: 0, goalsTracked: 3, goalsBehind: 0 },
  communication: { openComplaints: 0, waitingDays: null, hasHistory: true },
  financial: { overdueInvoices: 0, failedInvoices: 0, total: 6 },
  relationship: { satisfactionScore: 90, renewalProbability: 85, cancellationThreat: false },
  ...overrides,
});

const category = (result: ReturnType<typeof accountHealth>, key: string) =>
  result.categories.find((entry) => entry.key === key)!;

describe("account health", () => {
  it("reads a clean account as good", () => {
    const result = accountHealth(base());

    assert.equal(result.status, "GOOD");
    assert.ok(result.score !== null && result.score >= 90);
    assert.equal(result.assessedCount, 7);
  });

  it("never treats missing data as zero", () => {
    /*
     * The failure this exists to prevent: an account with no invoices and no
     * goals scoring badly for things nobody has done yet.
     */
    const empty = accountHealth(
      base({
        delivery: { total: 0, overdue: 0, blocked: 0 },
        performance: { reportsDue: 0, reportsOverdue: 0, goalsTracked: 0, goalsBehind: 0 },
        financial: { overdueInvoices: 0, failedInvoices: 0, total: 0 },
        relationship: null,
      }),
    );

    for (const key of ["delivery", "performance", "financial", "relationship"]) {
      assert.equal(category(empty, key).score, null, key);
    }

    assert.equal(empty.assessedCount, 3);
    assert.ok(empty.score !== null && empty.score >= 90, "what is known is still good");
  });

  it("returns no score at all for an account nothing is known about", () => {
    /*
     * A brand-new client. Silence must not read as good news: scoring
     * communication 100 here would put a healthy number on an account nobody
     * has spoken to.
     */
    const blank = accountHealth({
      journey: null,
      approvals: null,
      delivery: { total: 0, overdue: 0, blocked: 0 },
      performance: { reportsDue: 0, reportsOverdue: 0, goalsTracked: 0, goalsBehind: 0 },
      communication: { openComplaints: 0, waitingDays: null, hasHistory: false },
      financial: null,
      relationship: null,
    });

    assert.equal(blank.score, null);
    assert.equal(blank.status, null);
    assert.equal(blank.assessedCount, 0);
  });

  it("does read silence as good once there is a relationship to be silent in", () => {
    const settled = accountHealth({
      journey: null,
      approvals: null,
      delivery: { total: 0, overdue: 0, blocked: 0 },
      performance: { reportsDue: 0, reportsOverdue: 0, goalsTracked: 0, goalsBehind: 0 },
      communication: { openComplaints: 0, waitingDays: null, hasHistory: true },
      financial: null,
      relationship: null,
    });

    assert.equal(settled.score, 100);
  });

  it("hides finance rather than scoring it when the seat may not see it", () => {
    const hidden = accountHealth(base({ financial: null }));

    assert.equal(category(hidden, "financial").score, null);
    assert.match(category(hidden, "financial").detail, /not visible/i);
  });

  it("does not invent its own journey opinion", () => {
    const result = accountHealth(base({ journey: { score: 41, label: "At Risk" } }));

    assert.equal(category(result, "journey").score, 41);
    assert.match(category(result, "journey").detail, /At Risk/);
  });

  it("caps relationship when the client has threatened to cancel", () => {
    const threat = accountHealth(
      base({
        relationship: {
          satisfactionScore: 95,
          renewalProbability: 90,
          cancellationThreat: true,
        },
      }),
    );

    assert.ok(category(threat, "relationship").score! <= 25);
  });

  it("drops the account through the statuses as the evidence worsens", () => {
    const failing = accountHealth(
      base({
        journey: { score: 20, label: "Blocked" },
        approvals: { score: 30, blockers: ["two defects", "one approval", "launch check"] },
        delivery: { total: 10, overdue: 8, blocked: 2 },
        performance: { reportsDue: 4, reportsOverdue: 4, goalsTracked: 3, goalsBehind: 3 },
        communication: { openComplaints: 2, waitingDays: 40, hasHistory: true },
        financial: { overdueInvoices: 4, failedInvoices: 2, total: 6 },
        relationship: { satisfactionScore: 20, renewalProbability: 15, cancellationThreat: true },
      }),
    );

    assert.equal(failing.status, "CRITICAL");
    assert.ok(failing.risks.length >= 5);
    assert.equal(failing.actions[0]?.target, "recovery");
  });

  it("offers a recovery plan only once things are actually bad", () => {
    assert.equal(
      accountHealth(base()).actions.some((action) => action.target === "recovery"),
      false,
    );
  });

  it("points each action at the system that owns the problem", () => {
    const late = accountHealth(base({ delivery: { total: 10, overdue: 9, blocked: 0 } }));

    assert.ok(late.actions.some((action) => action.target === "delivery"));
  });

  it("says where every number came from", () => {
    for (const entry of accountHealth(base()).categories) {
      assert.ok(entry.source.length > 0, entry.key);
      assert.ok(entry.detail.length > 0, entry.key);
    }
  });

  it("weighs only the categories that had something to read", () => {
    /*
     * Delivery is heavily weighted. With every other category perfect and
     * delivery unknown, the total must not be dragged toward the middle.
     */
    const partial = accountHealth(base({ delivery: { total: 0, overdue: 0, blocked: 0 } }));

    assert.ok(partial.score !== null && partial.score >= 90);
  });
});
