import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GOAL_STATE_LABELS,
  goalProgress,
  healthSummary,
  isOptimizationOpen,
  nextReportingAction,
  optimizationSummary,
  renewalSummary,
  reportSummary,
  type GoalRow,
  type HealthAssessment,
  type OptimizationRow,
  type ReportRow,
} from "@/lib/success/reports-health";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const day = (offset: number) =>
  new Date(NOW.getTime() + offset * 86_400_000).toISOString();

const report = (overrides: Partial<ReportRow> = {}): ReportRow => ({
  id: "r1",
  type: "MONTHLY_REPORT",
  status: "SENT",
  periodStart: day(-60),
  periodEnd: day(-30),
  dueAt: day(-25),
  sentAt: day(-24),
  preparedByName: "Aileen Romero",
  documentUrl: null,
  ...overrides,
});

const optimization = (overrides: Partial<OptimizationRow> = {}): OptimizationRow => ({
  id: "o1",
  platform: "Google Ads",
  observedProblem: "Slow load times on mobile",
  proposedChange: "Improve mobile page speed",
  expectedMetric: "+10% conversion rate",
  result: null,
  decision: "PENDING",
  ownerName: "Josri Ocana",
  startDate: day(-14),
  endDate: null,
  ...overrides,
});

const goal = (overrides: Partial<GoalRow> = {}): GoalRow => ({
  id: "g1",
  title: "Generate 150 qualified leads",
  metric: "qualified leads per month",
  baseline: "90",
  target: "150",
  targetDate: day(30),
  status: "IN_PROGRESS",
  ownerName: null,
  priority: "HIGH",
  ...overrides,
});

const assessment = (overrides: Partial<HealthAssessment> = {}): HealthAssessment => ({
  status: "HEALTHY",
  healthScore: 82,
  satisfactionScore: 85,
  openComplaints: 0,
  renewalProbability: 80,
  assessedAt: day(-10),
  ...overrides,
});

/**
 * Reporting.
 *
 * The headline counts what the client actually received. A draft nobody sent
 * has told them nothing.
 */
describe("report summary", () => {
  it("counts delivered reports, not written ones", () => {
    const summary = reportSummary(
      [
        report({ id: "a", status: "SENT", sentAt: day(-10) }),
        report({ id: "b", status: "ACKNOWLEDGED", sentAt: day(-40) }),
        report({ id: "c", status: "DRAFT", sentAt: null }),
        report({ id: "d", status: "APPROVED", sentAt: null }),
      ],
      NOW,
    );

    assert.equal(summary.sentThisYear, 2);
    assert.equal(summary.open.length, 2);
  });

  it("does not count a draft carrying a stray sent date", () => {
    /*
     * The status and the timestamp can disagree - a report reverted to draft
     * after being sent keeps its sentAt. Only the status decides whether the
     * client has it, so a date on an unsent report must not inflate the count
     * on the card.
     */
    const summary = reportSummary(
      [
        report({ id: "sent", status: "SENT", sentAt: day(-10) }),
        report({ id: "reverted", status: "DRAFT", sentAt: day(-20) }),
        report({ id: "approved", status: "APPROVED", sentAt: day(-30) }),
      ],
      NOW,
    );

    assert.equal(summary.sentThisYear, 1);
  });

  it("offers no comparison when there is nothing to compare against", () => {
    // A first year of reporting is not an infinite improvement.
    const summary = reportSummary([report({ sentAt: day(-10) })], NOW);

    assert.equal(summary.sentLastYear, 0);
    assert.equal(summary.changePercent, null);
  });

  it("works out the change against last year", () => {
    const lastYear = new Date(NOW);
    lastYear.setFullYear(lastYear.getFullYear() - 1);

    const summary = reportSummary(
      [
        report({ id: "a", sentAt: day(-10) }),
        report({ id: "b", sentAt: day(-20) }),
        report({ id: "c", sentAt: day(-30) }),
        report({ id: "d", sentAt: lastYear.toISOString() }),
        report({ id: "e", sentAt: lastYear.toISOString() }),
      ],
      NOW,
    );

    // Three this year against two last year.
    assert.equal(summary.sentThisYear, 3);
    assert.equal(summary.sentLastYear, 2);
    assert.equal(summary.changePercent, 50);
  });

  it("counts down to the soonest report still owed", () => {
    const summary = reportSummary(
      [
        report({ id: "far", status: "DRAFT", sentAt: null, dueAt: day(30) }),
        report({ id: "near", status: "DRAFT", sentAt: null, dueAt: day(5) }),
      ],
      NOW,
    );

    assert.equal(summary.next.report?.id, "near");
    assert.equal(summary.next.daysRemaining, 5);
    assert.equal(summary.next.state, "SOON");
  });

  it("counts up once a report is late, and says so", () => {
    const summary = reportSummary(
      [report({ status: "DRAFT", sentAt: null, dueAt: day(-3) })],
      NOW,
    );

    assert.equal(summary.next.state, "OVERDUE");
    assert.equal(summary.next.daysRemaining, -3);
    assert.match(summary.next.label, /Overdue by 3 days/);
  });

  it("says nothing is scheduled rather than showing a false zero", () => {
    const summary = reportSummary([report({ status: "SENT" })], NOW);

    assert.equal(summary.next.state, "NONE");
    assert.equal(summary.next.daysRemaining, null);
    assert.match(summary.next.label, /Nothing scheduled/);
  });
});

/**
 * Optimizations.
 *
 * The stored field is a decision, not a status, so "open" has to be read from
 * the decision being unmade rather than from a status column that does not
 * exist.
 */
describe("optimizations", () => {
  it("treats an undecided optimization with no end date as running", () => {
    assert.equal(isOptimizationOpen(optimization()), true);
    assert.equal(isOptimizationOpen(optimization({ decision: "CONTINUE_TESTING" })), true);
  });

  it("treats a decided one as concluded", () => {
    for (const decision of ["KEEP", "ADJUST", "REVERSE", "INCONCLUSIVE"]) {
      assert.equal(isOptimizationOpen(optimization({ decision })), false, decision);
    }
  });

  it("closes anything with an end date whatever it decided", () => {
    assert.equal(
      isOptimizationOpen(optimization({ decision: "PENDING", endDate: day(-1) })),
      false,
    );
  });

  it("separates what worked from what was reversed", () => {
    const summary = optimizationSummary([
      optimization({ id: "1" }),
      optimization({ id: "2", decision: "KEEP" }),
      optimization({ id: "3", decision: "KEEP" }),
      optimization({ id: "4", decision: "REVERSE" }),
      optimization({ id: "5", decision: "INCONCLUSIVE" }),
    ]);

    assert.equal(summary.open.length, 1);
    assert.equal(summary.kept, 2);
    assert.equal(summary.reversed, 1);
    assert.equal(summary.inconclusive, 1);
  });
});

/* -------------------------------------------------------------------------- */

function health(overrides: Partial<Parameters<typeof healthSummary>[0]> = {}) {
  return healthSummary({
    assessment: assessment(),
    reports: reportSummary([], NOW),
    optimizations: optimizationSummary([]),
    openComplaints: 0,
    overdueTasks: 0,
    now: NOW,
    ...overrides,
  });
}

describe("health summary", () => {
  it("reports no score rather than a zero when nobody has assessed", () => {
    const summary = health({ assessment: null });

    assert.equal(summary.score, null);
    assert.equal(summary.status, null);
    assert.equal(summary.stale, false);
  });

  it("takes the score from the assessment rather than computing a second one", () => {
    const summary = health({ assessment: assessment({ healthScore: 64, status: "AT_RISK" }) });

    assert.equal(summary.score, 64);
    assert.equal(summary.status, "AT_RISK");
  });

  it("flags an assessment old enough to have stopped being true", () => {
    const summary = health({ assessment: assessment({ assessedAt: day(-90) }) });

    assert.equal(summary.stale, true);
    assert.ok(summary.risks.some((risk) => /last assessed/i.test(risk)));
  });

  it("draws its strengths and risks from live records", () => {
    const summary = health({
      reports: reportSummary([report({ sentAt: day(-5) })], NOW),
      optimizations: optimizationSummary([optimization({ decision: "KEEP" })]),
      openComplaints: 2,
      overdueTasks: 3,
    });

    assert.ok(summary.strengths.some((s) => /1 report delivered/i.test(s)));
    assert.ok(summary.strengths.some((s) => /1 optimization kept/i.test(s)));
    assert.ok(summary.risks.some((r) => /2 complaints open/i.test(r)));
    assert.ok(summary.risks.some((r) => /3 tasks overdue/i.test(r)));
  });

  it("reads a low satisfaction score as a risk and a high one as a strength", () => {
    assert.ok(
      health({ assessment: assessment({ satisfactionScore: 40 }) })
        .risks.some((r) => /satisfaction/i.test(r)),
    );
    assert.ok(
      health({ assessment: assessment({ satisfactionScore: 90 }) })
        .strengths.some((s) => /satisfaction/i.test(s)),
    );
  });
});

/**
 * Goals.
 *
 * Targets are free text, so there is nothing to compute a percentage from.
 * These states come from the status somebody set and the date.
 */
describe("goal progress", () => {
  it("never invents a percentage", () => {
    const [entry] = goalProgress([goal()], NOW);

    assert.equal("percent" in entry, false);
    assert.equal("progress" in entry, false);
    assert.ok(entry.reason.length > 0);
  });

  it("honours a goal marked achieved whatever the date says", () => {
    const [entry] = goalProgress([goal({ status: "ACHIEVED", targetDate: day(-60) })], NOW);

    assert.equal(entry.state, "ACHIEVED");
  });

  it("calls an in-progress goal past its date behind", () => {
    const [entry] = goalProgress([goal({ targetDate: day(-5) })], NOW);

    assert.equal(entry.state, "BEHIND");
    assert.match(entry.reason, /passed 5 days ago/);
  });

  it("warns as the date closes in", () => {
    const [entry] = goalProgress([goal({ targetDate: day(7) })], NOW);

    assert.equal(entry.state, "AT_RISK");
  });

  it("does not call a proposed goal on track", () => {
    // Nobody has agreed to it yet, so it is not progressing.
    const [entry] = goalProgress([goal({ status: "PROPOSED" })], NOW);

    assert.equal(entry.state, "NOT_STARTED");
  });

  it("has a label for every state it can produce", () => {
    const states = goalProgress(
      [
        goal({ id: "1", status: "ACHIEVED" }),
        goal({ id: "2", status: "DROPPED" }),
        goal({ id: "3", status: "PROPOSED" }),
        goal({ id: "4", targetDate: day(-1) }),
        goal({ id: "5", targetDate: day(3) }),
        goal({ id: "6", targetDate: day(60) }),
        goal({ id: "7", targetDate: null }),
      ],
      NOW,
    );

    for (const entry of states) {
      assert.ok(GOAL_STATE_LABELS[entry.state], `${entry.state} has no label`);
    }
  });
});

describe("renewal summary", () => {
  it("falls back to the contract end when no renewal date is set", () => {
    const summary = renewalSummary({
      renewalDate: null,
      monthlyValue: 1800,
      contractStart: day(-300),
      contractEnd: day(65),
      stage: null,
      now: NOW,
    });

    assert.equal(summary.daysRemaining, 65);
    assert.equal(summary.approaching, true);
    assert.equal(summary.contractMonths, 12);
  });

  it("says nothing rather than zero when there is no date at all", () => {
    const summary = renewalSummary({
      renewalDate: null, monthlyValue: null, contractStart: null,
      contractEnd: null, stage: null, now: NOW,
    });

    assert.equal(summary.renewalDate, null);
    assert.equal(summary.daysRemaining, null);
    assert.equal(summary.approaching, false);
  });

  it("is not approaching while it is still far off", () => {
    const summary = renewalSummary({
      renewalDate: day(200), monthlyValue: 1800, contractStart: null,
      contractEnd: null, stage: null, now: NOW,
    });

    assert.equal(summary.approaching, false);
  });
});

/* -------------------------------------------------------------------------- */

function action(overrides: Partial<Parameters<typeof nextReportingAction>[0]> = {}) {
  return nextReportingAction({
    reports: reportSummary([report({ dueAt: day(60), status: "DRAFT", sentAt: null })], NOW),
    health: health(),
    optimizations: optimizationSummary([]),
    goals: [],
    renewal: renewalSummary({
      renewalDate: day(300), monthlyValue: 1800, contractStart: null,
      contractEnd: null, stage: null, now: NOW,
    }),
    ...overrides,
  });
}

/**
 * The next action.
 *
 * Ordered by what costs the agency most, and deterministic - the same account
 * produces the same answer twice.
 */
describe("next reporting action", () => {
  it("puts an overdue report above everything", () => {
    const result = action({
      reports: reportSummary([report({ status: "LATE", sentAt: null, dueAt: day(-4) })], NOW),
      health: health({ assessment: assessment({ status: "CRITICAL" }) }),
      goals: goalProgress([goal({ targetDate: day(-10) })], NOW),
    });

    assert.equal(result.key, "report-overdue");
    assert.equal(result.action?.target, "report");
  });

  it("puts failing health above a report that is merely due soon", () => {
    const result = action({
      reports: reportSummary([report({ status: "DRAFT", sentAt: null, dueAt: day(3) })], NOW),
      health: health({ assessment: assessment({ status: "AT_RISK" }) }),
    });

    assert.equal(result.key, "health-poor");
  });

  it("asks for a first assessment when none has been made", () => {
    const result = action({ health: health({ assessment: null }) });

    assert.equal(result.key, "health-stale");
    assert.match(result.title, /never been assessed/i);
  });

  it("raises a goal past its date once the urgent things are clear", () => {
    const result = action({ goals: goalProgress([goal({ targetDate: day(-2) })], NOW) });

    assert.equal(result.key, "goal-behind");
  });

  it("mentions a renewal only when it is close", () => {
    const near = action({
      renewal: renewalSummary({
        renewalDate: day(40), monthlyValue: 1800, contractStart: null,
        contractEnd: null, stage: null, now: NOW,
      }),
    });

    assert.equal(near.key, "renewal-approaching");
  });

  it("says so plainly when there is nothing to do, and offers no button", () => {
    const result = action();

    assert.equal(result.key, "nothing");
    assert.equal(result.action, null);
  });

  it("is deterministic", () => {
    assert.deepEqual(action(), action());
  });
});
