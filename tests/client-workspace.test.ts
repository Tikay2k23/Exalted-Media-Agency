import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_CLIENT_FILTERS,
  HEALTH_LABELS,
  applyClientFilters,
  attentionReasons,
  healthFromStatus,
  isRenewalDueSoon,
  isWaitingOnClient,
  matchesSummary,
  milestoneFeed,
  needsAttention,
  nextMilestone,
  quickFilterChips,
  relativeTime,
  serviceLabel,
  sortClients,
  summaryCards,
  urgencyScore,
  type ClientMilestone,
  type ClientRow,
} from "@/lib/clients/client-workspace";

/** A Thursday at 10am. */
const NOW = new Date(2026, 7, 13, 10, 0, 0);

function milestone(overrides: Partial<ClientMilestone> = {}): ClientMilestone {
  return {
    id: Math.random().toString(36).slice(2),
    clientId: "client-1",
    clientName: "Summit Peak Roofing",
    name: "Client Review",
    source: "project-milestone",
    dueAt: "2026-08-18T14:00:00",
    hasTime: true,
    tab: "tasks",
    status: null,
    ...overrides,
  };
}

function client(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: Math.random().toString(36).slice(2),
    companyName: "Summit Peak Roofing",
    clientName: "Daniel Brooks",
    contactEmail: "brooks@summitpeakroofing.com",
    contactPhone: "(555) 100 1000",
    status: "ACTIVE",
    healthStatus: "GREEN",
    stageId: "stage-production",
    stageName: "In Production",
    stageKey: "production",
    ownerId: "user-mark",
    ownerName: "Mark Angelo",
    serviceType: "CRM_AUTOMATION",
    services: ["CRM_AUTOMATION"],
    monthlyValue: 4200,
    contractStartDate: "2026-08-13T00:00:00",
    contractEndDate: null,
    renewalDate: null,
    currentBlocker: null,
    nextAction: "Schedule the strategy call",
    nextActionDueAt: "2026-08-18T00:00:00",
    lastClientUpdateAt: "2026-08-12T09:00:00",
    dateAdded: "2026-07-01T09:00:00",
    updatedAt: "2026-08-13T08:00:00",
    openTaskCount: 4,
    overdueTaskCount: 0,
    waitingTaskCount: 0,
    criticalAccessMissing: 0,
    intakeStatus: "SUBMITTED",
    openDefectCount: 0,
    awaitingReviewCount: 0,
    overdueReportCount: 0,
    lastActivityAt: "2026-08-13T08:00:00",
    lastActivityLabel: "Task completed",
    milestones: [],
    ...overrides,
  };
}

describe("health, stage and operational state are three different facts", () => {
  it("only ever produces the four health values", () => {
    for (const status of ["GREEN", "YELLOW", "RED", "NOT_ASSESSED", "SOMETHING_ELSE"]) {
      const health = healthFromStatus(status);

      assert.ok(health in HEALTH_LABELS, `${status} produced ${health}`);
    }
  });

  it("never returns an operational state as health", () => {
    // "Waiting on Client" is a thing that is true about today, not a judgement
    // about the account, and putting it in this field makes both unusable.
    const waiting = client({ waitingTaskCount: 3, healthStatus: "GREEN" });

    assert.equal(healthFromStatus(waiting.healthStatus), "ON_TRACK");
    assert.equal(isWaitingOnClient(waiting), true);
  });

  it("lets a healthy account be waiting on the client, and vice versa", () => {
    const healthyButWaiting = client({ healthStatus: "GREEN", criticalAccessMissing: 1 });
    const atRiskButNotWaiting = client({ healthStatus: "RED" });

    assert.equal(healthFromStatus(healthyButWaiting.healthStatus), "ON_TRACK");
    assert.equal(isWaitingOnClient(healthyButWaiting), true);

    assert.equal(healthFromStatus(atRiskButNotWaiting.healthStatus), "AT_RISK");
    assert.equal(isWaitingOnClient(atRiskButNotWaiting), false);
  });

  it("lets a recorded blocker outrank a stale assessment", () => {
    assert.equal(healthFromStatus("GREEN", { hasBlocker: true }), "BLOCKED");
  });

  it("counts an incomplete intake as waiting on the client", () => {
    assert.equal(isWaitingOnClient(client({ intakeStatus: "SENT" })), true);
    assert.equal(isWaitingOnClient(client({ intakeStatus: "PARTIALLY_COMPLETED" })), true);
    assert.equal(isWaitingOnClient(client({ intakeStatus: "SUBMITTED" })), false);
    // Nobody has sent it, so this is the agency waiting on itself.
    assert.equal(isWaitingOnClient(client({ intakeStatus: "NOT_SENT" })), false);
    // No intake record at all is not the client's fault either.
    assert.equal(isWaitingOnClient(client({ intakeStatus: null })), false);
  });
});

describe("what needs attention", () => {
  it("finds nothing wrong with an account that is fine", () => {
    assert.deepEqual(attentionReasons(client(), NOW), []);
    assert.equal(needsAttention(client(), NOW), false);
  });

  it("puts a blocker above overdue work above a quiet account", () => {
    const messy = client({
      currentBlocker: "Meta Ads access",
      overdueTaskCount: 2,
      lastActivityAt: "2026-07-20T09:00:00",
    });

    assert.deepEqual(
      attentionReasons(messy, NOW).map((reason) => reason.key),
      ["blocker", "overdue-work", "no-activity"],
    );
  });

  it("surfaces a red account, and only once somebody has assessed it", () => {
    /*
     * The colour is only ever written by recording an assessment, so this
     * cannot fire on an account nobody has looked at - which is the whole
     * difference between a warning and a guess.
     */
    assert.equal(
      attentionReasons(client({ healthStatus: "NOT_ASSESSED" }), NOW).some(
        (reason) => reason.key === "account-at-risk",
      ),
      false,
    );

    const red = attentionReasons(client({ healthStatus: "RED" }), NOW);

    assert.equal(red.some((reason) => reason.key === "account-at-risk"), true);
    assert.equal(red.find((reason) => reason.key === "account-at-risk")?.tab, "reports");
  });

  it("sends each reason to the tab that can actually fix it", () => {
    const messy = client({
      criticalAccessMissing: 1,
      overdueTaskCount: 1,
      awaitingReviewCount: 1,
      overdueReportCount: 1,
      intakeStatus: "SENT",
    });

    const byKey = new Map(attentionReasons(messy, NOW).map((r) => [r.key, r.tab]));

    assert.equal(byKey.get("missing-access"), "files");
    assert.equal(byKey.get("overdue-work"), "tasks");
    assert.equal(byKey.get("approval-overdue"), "quality");
    assert.equal(byKey.get("report-overdue"), "reports");
    assert.equal(byKey.get("intake-incomplete"), "services");
  });

  it("treats a renewal that has already passed as more urgent, not less", () => {
    const passed = client({ renewalDate: "2026-08-01T00:00:00" });
    const upcoming = client({ renewalDate: "2026-09-01T00:00:00" });

    assert.equal(
      attentionReasons(passed, NOW).find((r) => r.key === "renewal-approaching")?.label,
      "Renewal date has passed",
    );
    assert.equal(isRenewalDueSoon(upcoming, NOW), true);
    // Far enough out that nobody needs to think about it yet.
    assert.equal(isRenewalDueSoon(client({ renewalDate: "2027-01-01T00:00:00" }), NOW), false);
  });

  it("does not nag a paused account about a missing next action", () => {
    const paused = client({ status: "ON_HOLD", nextAction: null });

    assert.equal(
      attentionReasons(paused, NOW).some((r) => r.key === "no-next-action"),
      false,
    );
  });

  it("scores an account with several small problems above one with a single late report", () => {
    const scattered = client({
      criticalAccessMissing: 1,
      awaitingReviewCount: 1,
      openDefectCount: 1,
    });
    const oneLateReport = client({ overdueReportCount: 1 });

    assert.ok(urgencyScore(scattered, NOW) > urgencyScore(oneLateReport, NOW));
  });
});

describe("milestones", () => {
  it("takes the soonest one still ahead of us", () => {
    const row = client({
      milestones: [
        milestone({ name: "Renewal", dueAt: "2026-11-13T00:00:00" }),
        milestone({ name: "Client Review", dueAt: "2026-08-18T14:00:00" }),
        milestone({ name: "Strategy Call", dueAt: "2026-08-14T14:00:00" }),
      ],
    });

    assert.equal(nextMilestone(row, NOW)?.name, "Strategy Call");
  });

  it("falls back to the most recent past one rather than showing nothing", () => {
    const row = client({
      milestones: [
        milestone({ name: "Kickoff", dueAt: "2026-07-01T00:00:00" }),
        milestone({ name: "Access Collection", dueAt: "2026-08-10T00:00:00" }),
      ],
    });

    assert.equal(nextMilestone(row, NOW)?.name, "Access Collection");
  });

  it("returns nothing when the account has no dated commitments", () => {
    assert.equal(nextMilestone(client(), NOW), null);
  });

  it("builds one calendar across every client, soonest first", () => {
    const rows = [
      client({
        companyName: "Alpha",
        milestones: [milestone({ clientName: "Alpha", dueAt: "2026-08-20T09:00:00" })],
      }),
      client({
        companyName: "Beta",
        milestones: [
          milestone({ clientName: "Beta", dueAt: "2026-08-14T09:00:00" }),
          // Already gone: belongs in history, not in "upcoming".
          milestone({ clientName: "Beta", dueAt: "2026-08-01T09:00:00" }),
        ],
      }),
    ];

    const feed = milestoneFeed(rows, NOW);

    assert.deepEqual(
      feed.map((entry) => entry.clientName),
      ["Beta", "Alpha"],
    );
  });

  it("keeps one client's milestones out of another's", () => {
    // The failure this guards: opening Summit Peak Roofing and seeing Best Life
    // Chiropractic's client review in its Upcoming Milestones.
    const summit = client({
      id: "summit",
      milestones: [milestone({ clientId: "summit", clientName: "Summit Peak Roofing" })],
    });
    const bestLife = client({
      id: "best-life",
      milestones: [milestone({ clientId: "best-life", clientName: "Best Life Chiropractic" })],
    });

    for (const entry of milestoneFeed([summit], NOW)) {
      assert.equal(entry.clientId, "summit");
    }

    assert.equal(milestoneFeed([summit, bestLife], NOW).length, 2);
  });
});

describe("the summary cards", () => {
  const rows = [
    client({ companyName: "Fine" }),
    client({ companyName: "Overdue", overdueTaskCount: 3 }),
    client({ companyName: "Waiting", criticalAccessMissing: 2 }),
    client({ companyName: "Renewing", renewalDate: "2026-08-30T00:00:00" }),
    client({ companyName: "Paused", status: "ON_HOLD", openTaskCount: 0 }),
  ];

  it("counts each card with the predicate its filter uses", () => {
    for (const card of summaryCards(rows, NOW)) {
      if (card.key === "open-work") continue;

      const filtered = rows.filter((row) => matchesSummary(row, card.key, NOW));

      assert.equal(filtered.length, card.value, card.key);
    }
  });

  it("counts open work as tasks rather than as accounts", () => {
    const openWork = summaryCards(rows, NOW).find((card) => card.key === "open-work");

    assert.equal(
      openWork?.value,
      rows.reduce((sum, row) => sum + row.openTaskCount, 0),
    );
  });

  it("leaves a paused account out of Active", () => {
    assert.equal(summaryCards(rows, NOW).find((card) => card.key === "active")?.value, 4);
  });
});

describe("the directory", () => {
  const rows = [
    client({ companyName: "Alpha Dental", ownerName: "Mark Angelo", ownerId: "mark" }),
    client({
      companyName: "Beta Roofing",
      ownerId: "sarah",
      ownerName: "Sarah Reyes",
      overdueTaskCount: 4,
      healthStatus: "RED",
    }),
    client({
      companyName: "Gamma Pools",
      ownerId: null,
      ownerName: null,
      services: ["SEO", "PAID_ADVERTISING"],
      serviceType: "SEO",
    }),
  ];

  it("counts each chip with the predicate the chip filters by", () => {
    for (const chip of quickFilterChips(rows, NOW)) {
      const filtered = applyClientFilters(rows, { ...EMPTY_CLIENT_FILTERS, quick: chip.key }, NOW);

      assert.equal(filtered.length, chip.count, chip.key);
    }
  });

  it("searches across the fields somebody would actually type", () => {
    for (const term of ["beta", "sarah", "summitpeakroofing.com", "paid advertising"]) {
      const found = applyClientFilters(rows, { ...EMPTY_CLIENT_FILTERS, search: term }, NOW);

      assert.ok(found.length >= 1, term);
    }
  });

  it("filters unassigned accounts under their own owner key", () => {
    const found = applyClientFilters(
      rows,
      { ...EMPTY_CLIENT_FILTERS, ownerId: "unassigned" },
      NOW,
    );

    assert.deepEqual(found.map((row) => row.companyName), ["Gamma Pools"]);
  });

  it("filters on any of an account's services, not only its primary one", () => {
    const found = applyClientFilters(
      rows,
      { ...EMPTY_CLIENT_FILTERS, service: "PAID_ADVERTISING" },
      NOW,
    );

    assert.deepEqual(found.map((row) => row.companyName), ["Gamma Pools"]);
  });

  it("puts the loudest account first by default", () => {
    const sorted = sortClients(rows, "most-urgent", NOW);

    assert.equal(sorted[0]!.companyName, "Beta Roofing");
  });

  it("sends accounts with no milestone to the end of milestone order", () => {
    const dated = client({ companyName: "Dated", milestones: [milestone()] });
    const undated = client({ companyName: "Undated" });

    assert.deepEqual(
      sortClients([undated, dated], "milestone-soonest", NOW).map((row) => row.companyName),
      ["Dated", "Undated"],
    );
  });

  it("sends accounts with no renewal to the end of renewal order", () => {
    const renewing = client({ companyName: "Renewing", renewalDate: "2026-09-01T00:00:00" });
    const openEnded = client({ companyName: "Open Ended" });

    assert.deepEqual(
      sortClients([openEnded, renewing], "renewal-soonest", NOW).map((row) => row.companyName),
      ["Renewing", "Open Ended"],
    );
  });
});

describe("how things read", () => {
  it("names one service and counts several", () => {
    assert.equal(serviceLabel(client({ services: ["CRM_AUTOMATION"] })), "Crm Automation");
    assert.equal(serviceLabel(client({ services: ["SEO", "PAID_ADVERTISING"] })), "2 Services");
    // Falls back to the primary service on an account with no workstreams yet.
    assert.equal(serviceLabel(client({ services: [], serviceType: "SEO" })), "Seo");
  });

  it("says never rather than leaving last activity blank", () => {
    assert.equal(relativeTime(null, NOW), "Never");
    assert.equal(relativeTime("2026-08-13T08:00:00", NOW), "2 hours ago");
    assert.equal(relativeTime("2026-08-12T09:00:00", NOW), "Yesterday");
  });
});
