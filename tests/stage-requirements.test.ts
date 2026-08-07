import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type EvaluableApproval,
  type EvaluableClient,
  type EvaluableTask,
  REQUIREMENT_DEFINITIONS,
  STAGE_REQUIREMENT_SEED,
  evaluateStageRequirements,
  getRequirementDefinition,
  isOpenTask,
} from "@/lib/journey/stage-requirements";
import {
  STAGE_TASK_TEMPLATES,
  getStageTaskTemplates,
  resolveAssignee,
} from "@/lib/automation/stage-automation";

function task(overrides: Partial<EvaluableTask> = {}): EvaluableTask {
  return {
    id: "task-1",
    title: "Some work",
    status: "DONE",
    category: "INTERNAL_OPERATIONS",
    priority: "MEDIUM",
    assignedToId: "user-1",
    ...overrides,
  };
}

/** A sign-off somebody could actually check afterwards. */
function approval(overrides: Partial<EvaluableApproval> = {}): EvaluableApproval {
  return {
    type: "DELIVERABLE",
    status: "RECORDED",
    approvedByName: "Maria Santos",
    evidenceUrl: "https://mail.example.test/thread/9",
    notes: null,
    ...overrides,
  };
}

function client(overrides: Partial<EvaluableClient> = {}): EvaluableClient {
  return {
    id: "client-1",
    assignedUserId: "user-1",
    contractStartDate: new Date("2026-01-01"),
    monthlyValue: 2500,
    healthStatus: "GREEN",
    renewalDate: new Date("2027-01-01"),
    contacts: [{ isPrimary: true, isApprover: true }],
    projects: [{ id: "project-1", projectManagerId: "user-2" }],
    agencyTasks: [task()],
    invoices: [{ status: "PAID" }],
    accessRecords: [{ platform: "GOHIGHLEVEL", isCritical: true, status: "TESTED" }],
    strategyBrief: { status: "APPROVED" },
    defects: [],
    approvals: [approval()],
    launches: [
      {
        backupVerifiedAt: new Date("2026-02-01"),
        rollbackPlan: "Restore the previous site snapshot and repoint DNS.",
        ownerId: "user-2",
      },
    ],
    offboarding: null,
    ...overrides,
  };
}

const requirement = (key: string, isBlocking = true) => ({
  requirementKey: key,
  label: getRequirementDefinition(key)?.label ?? key,
  isBlocking,
});

describe("individual requirement checkers", () => {
  it("fails when the account has no owner", () => {
    const result = evaluateStageRequirements(
      client({ assignedUserId: null }),
      [requirement("account_owner_assigned")],
    );

    assert.equal(result.passed, false);
    assert.match(result.blocking[0].reason ?? "", /No team member is assigned/);
  });

  it("fails when no contact is marked as an approver", () => {
    const result = evaluateStageRequirements(
      client({ contacts: [{ isPrimary: true, isApprover: false }] }),
      [requirement("client_approver_recorded")],
    );

    assert.equal(result.passed, false);
  });

  it("names each missing contract field", () => {
    const result = evaluateStageRequirements(
      client({ contractStartDate: null, monthlyValue: null }),
      [requirement("contract_recorded")],
    );

    assert.match(result.blocking[0].reason ?? "", /contract start date and monthly value/);
  });

  it("passes contract_recorded when a zero monthly value is recorded", () => {
    // Zero is a real, deliberate value - a pro bono or trial account. It must
    // not be confused with "not filled in".
    const result = evaluateStageRequirements(
      client({ monthlyValue: 0 }),
      [requirement("contract_recorded")],
    );

    assert.equal(result.passed, true);
  });

  it("fails when a project has no manager", () => {
    const result = evaluateStageRequirements(
      client({ projects: [{ id: "project-1", projectManagerId: null }] }),
      [requirement("project_manager_assigned")],
    );

    assert.equal(result.passed, false);
  });

  it("fails when an open work item has no assignee", () => {
    const result = evaluateStageRequirements(
      client({ agencyTasks: [task({ status: "IN_PROGRESS", assignedToId: null })] }),
      [requirement("work_assigned")],
    );

    assert.match(result.blocking[0].reason ?? "", /no assignee/);
  });

  it("ignores closed work items when checking for open work", () => {
    const result = evaluateStageRequirements(
      client({
        agencyTasks: [
          task({ status: "DONE", category: "ONBOARDING" }),
          task({ status: "CANCELLED", category: "ONBOARDING" }),
        ],
      }),
      [requirement("onboarding_tasks_complete")],
    );

    assert.equal(result.passed, true);
  });

  it("blocks on open QA work and names the offending items", () => {
    const result = evaluateStageRequirements(
      client({
        agencyTasks: [
          task({ status: "IN_PROGRESS", category: "QUALITY_ASSURANCE", title: "QA pass" }),
        ],
      }),
      [requirement("qa_tasks_complete")],
    );

    assert.equal(result.passed, false);
    assert.match(result.blocking[0].reason ?? "", /"QA pass"/);
  });

  it("blocks launch readiness while critical work is open", () => {
    const result = evaluateStageRequirements(
      client({
        agencyTasks: [task({ status: "BLOCKED", priority: "CRITICAL", title: "Tracking broken" })],
      }),
      [requirement("no_critical_open_work")],
    );

    assert.equal(result.passed, false);
  });

  it("requires a launch work item with an owner", () => {
    const noLaunchTask = evaluateStageRequirements(client(), [
      requirement("launch_owner_assigned"),
    ]);
    assert.equal(noLaunchTask.passed, false);

    const unownedLaunchTask = evaluateStageRequirements(
      client({ agencyTasks: [task({ category: "LAUNCH", assignedToId: null })] }),
      [requirement("launch_owner_assigned")],
    );
    assert.equal(unownedLaunchTask.passed, false);

    const ownedLaunchTask = evaluateStageRequirements(
      client({ agencyTasks: [task({ category: "LAUNCH", assignedToId: "user-3" })] }),
      [requirement("launch_owner_assigned")],
    );
    assert.equal(ownedLaunchTask.passed, true);
  });

  it("requires health to be assessed before ongoing management", () => {
    const result = evaluateStageRequirements(
      client({ healthStatus: "NOT_ASSESSED" }),
      [requirement("health_assessed")],
    );

    assert.equal(result.passed, false);
  });
});

describe("requirements backed by the commercial, access, QA and launch records", () => {
  it("requires a paid invoice, not merely an issued one", () => {
    assert.equal(
      evaluateStageRequirements(client({ invoices: [] }), [requirement("payment_confirmed")])
        .passed,
      false,
    );

    assert.equal(
      evaluateStageRequirements(client({ invoices: [{ status: "SENT" }] }), [
        requirement("payment_confirmed"),
      ]).passed,
      false,
    );

    assert.equal(
      evaluateStageRequirements(client({ invoices: [{ status: "PAID" }] }), [
        requirement("payment_confirmed"),
      ]).passed,
      true,
    );
  });

  it("calls out failed and overdue invoices specifically", () => {
    const result = evaluateStageRequirements(
      client({ invoices: [{ status: "FAILED" }, { status: "OVERDUE" }] }),
      [requirement("payment_confirmed")],
    );

    assert.match(result.blocking[0].reason ?? "", /2 invoice\(s\) are overdue or failed/);
  });

  it("blocks production while critical platform access is missing", () => {
    const result = evaluateStageRequirements(
      client({
        accessRecords: [
          { platform: "GOHIGHLEVEL", isCritical: true, status: "REQUESTED" },
          { platform: "GOOGLE_ADS", isCritical: true, status: "TESTED" },
          { platform: "SOCIAL_TIKTOK", isCritical: false, status: "NOT_REQUESTED" },
        ],
      }),
      [requirement("critical_access_collected")],
    );

    assert.equal(result.passed, false);
    assert.match(result.blocking[0].reason ?? "", /GOHIGHLEVEL/);
    // A non-critical platform must not block the gate.
    assert.doesNotMatch(result.blocking[0].reason ?? "", /TIKTOK/);
  });

  it("treats granted-but-untested access as collected but not tested", () => {
    const granted = client({
      accessRecords: [{ platform: "HOSTING", isCritical: true, status: "GRANTED" }],
    });

    assert.equal(
      evaluateStageRequirements(granted, [requirement("critical_access_collected")]).passed,
      true,
    );
    assert.equal(
      evaluateStageRequirements(granted, [requirement("critical_access_tested")]).passed,
      false,
    );
  });

  it("requires the strategy brief to be approved, not merely drafted", () => {
    assert.equal(
      evaluateStageRequirements(client({ strategyBrief: null }), [
        requirement("strategy_brief_approved"),
      ]).passed,
      false,
    );

    const inReview = evaluateStageRequirements(
      client({ strategyBrief: { status: "IN_REVIEW" } }),
      [requirement("strategy_brief_approved")],
    );
    assert.equal(inReview.passed, false);
    assert.match(inReview.blocking[0].reason ?? "", /in review, not approved/);
  });

  it("blocks launch while a critical defect is open, and names it", () => {
    const result = evaluateStageRequirements(
      client({
        defects: [
          { reference: "DEF-000041", severity: "CRITICAL", status: "IN_PROGRESS" },
          { reference: "DEF-000042", severity: "LOW", status: "NEW" },
        ],
      }),
      [requirement("critical_defects_closed")],
    );

    assert.equal(result.passed, false);
    assert.match(result.blocking[0].reason ?? "", /DEF-000041/);
    assert.doesNotMatch(result.blocking[0].reason ?? "", /DEF-000042/);
  });

  it("accepts a critical defect that was closed, passed, or explicitly won't fix", () => {
    for (const status of ["CLOSED", "PASSED", "WONT_FIX"] as const) {
      const result = evaluateStageRequirements(
        client({ defects: [{ reference: "DEF-1", severity: "CRITICAL", status }] }),
        [requirement("critical_defects_closed")],
      );

      assert.equal(result.passed, true, `status ${status} should not block`);
    }
  });

  it("requires a recorded client approval before launch", () => {
    assert.equal(
      evaluateStageRequirements(client({ approvals: [] }), [
        requirement("client_approval_recorded"),
      ]).passed,
      false,
    );

    // A strategy brief approval is not a deliverable sign-off.
    assert.equal(
      evaluateStageRequirements(client({ approvals: [approval({ type: "STRATEGY_BRIEF" })] }), [
        requirement("client_approval_recorded"),
      ]).passed,
      false,
    );

    assert.equal(
      evaluateStageRequirements(client({ approvals: [approval({ type: "FINAL_SIGN_OFF" })] }), [
        requirement("client_approval_recorded"),
      ]).passed,
      true,
    );
  });

  it("requires both a verified backup and a written rollback plan", () => {
    const noBackup = evaluateStageRequirements(
      client({
        launches: [{ backupVerifiedAt: null, rollbackPlan: "Repoint DNS.", ownerId: "u" }],
      }),
      [requirement("backup_verified")],
    );
    assert.equal(noBackup.passed, false);
    assert.match(noBackup.blocking[0].reason ?? "", /verified backup/);

    const noPlan = evaluateStageRequirements(
      client({
        launches: [{ backupVerifiedAt: new Date(), rollbackPlan: null, ownerId: "u" }],
      }),
      [requirement("backup_verified")],
    );
    assert.equal(noPlan.passed, false);
    assert.match(noPlan.blocking[0].reason ?? "", /rollback plan/);
  });

  it("will not archive an account while money is outstanding", () => {
    const result = evaluateStageRequirements(
      client({ invoices: [{ status: "PAID" }, { status: "OVERDUE" }] }),
      [requirement("final_billing_settled")],
    );

    assert.equal(result.passed, false);
    assert.match(result.blocking[0].reason ?? "", /still outstanding/);
  });

  it("will not archive before client administrator access is confirmed", () => {
    // This is the ordering that stops an agency locking a client out of their
    // own platforms on the way out.
    const unconfirmed = evaluateStageRequirements(
      client({
        offboarding: {
          clientAdminAccessConfirmedAt: null,
          finalBillingSettledAt: new Date(),
        },
      }),
      [requirement("client_admin_access_confirmed")],
    );

    assert.equal(unconfirmed.passed, false);
    assert.match(unconfirmed.blocking[0].reason ?? "", /must not be removed first/);

    const confirmed = evaluateStageRequirements(
      client({
        offboarding: {
          clientAdminAccessConfirmedAt: new Date(),
          finalBillingSettledAt: new Date(),
        },
      }),
      [requirement("client_admin_access_confirmed")],
    );

    assert.equal(confirmed.passed, true);
  });
});

describe("gate evaluation", () => {
  it("passes when every requirement is satisfied", () => {
    const result = evaluateStageRequirements(client(), [
      requirement("account_owner_assigned"),
      requirement("contract_recorded"),
      requirement("project_exists"),
    ]);

    assert.equal(result.passed, true);
    assert.equal(result.unmet.length, 0);
  });

  it("reports every unmet requirement, not just the first", () => {
    const result = evaluateStageRequirements(
      client({
        assignedUserId: null,
        contractStartDate: null,
        monthlyValue: null,
        projects: [],
      }),
      [
        requirement("account_owner_assigned"),
        requirement("contract_recorded"),
        requirement("project_exists"),
      ],
    );

    assert.equal(result.blocking.length, 3);
  });

  it("does not block on a non-blocking requirement", () => {
    const result = evaluateStageRequirements(
      client({ healthStatus: "NOT_ASSESSED" }),
      [requirement("health_assessed", false)],
    );

    assert.equal(result.passed, true);
    assert.equal(result.unmet.length, 1);
    assert.equal(result.blocking.length, 0);
  });

  it("fails closed on a requirement with no registered checker", () => {
    // A rule nobody actually checks is worse than no rule, so an unknown key
    // must block rather than wave the move through.
    const result = evaluateStageRequirements(client(), [
      { requirementKey: "invented_rule", label: "Invented rule", isBlocking: true },
    ]);

    assert.equal(result.passed, false);
    assert.equal(result.blocking[0].unverifiable, true);
    assert.match(result.blocking[0].reason ?? "", /cannot be verified/);
  });

  it("passes a stage with no requirements configured", () => {
    assert.equal(evaluateStageRequirements(client(), []).passed, true);
  });
});

describe("requirement catalogue integrity", () => {
  it("every seeded stage requirement has a registered checker", () => {
    for (const [stageKey, keys] of Object.entries(STAGE_REQUIREMENT_SEED)) {
      for (const key of keys) {
        assert.ok(
          getRequirementDefinition(key),
          `stage "${stageKey}" references unknown requirement "${key}"`,
        );
      }
    }
  });

  it("has no duplicate requirement keys", () => {
    const keys = REQUIREMENT_DEFINITIONS.map((definition) => definition.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("treats every non-terminal status as open work", () => {
    assert.equal(isOpenTask("TODO"), true);
    assert.equal(isOpenTask("BLOCKED"), true);
    assert.equal(isOpenTask("READY_FOR_QA"), true);
    assert.equal(isOpenTask("DONE"), false);
    assert.equal(isOpenTask("CANCELLED"), false);
  });
});

describe("stage automation", () => {
  it("generates onboarding work when payment is received", () => {
    const templates = getStageTaskTemplates("payment_received");

    assert.ok(templates.length >= 3);
    assert.ok(templates.every((template) => template.dueInDays > 0));
  });

  it("returns nothing for a stage with no automation and for a null key", () => {
    assert.deepEqual(getStageTaskTemplates("waiting_for_client_information"), []);
    assert.deepEqual(getStageTaskTemplates(null), []);
  });

  it("never leaves generated work unassigned", () => {
    const candidates = { accountOwnerId: null, projectManagerId: null, actorId: "actor" };

    assert.equal(resolveAssignee("ACCOUNT_OWNER", candidates), "actor");
    assert.equal(resolveAssignee("PROJECT_MANAGER", candidates), "actor");
    assert.equal(resolveAssignee("ACTOR", candidates), "actor");
  });

  it("prefers the project manager, then the account owner", () => {
    assert.equal(
      resolveAssignee("PROJECT_MANAGER", {
        accountOwnerId: "owner",
        projectManagerId: "pm",
        actorId: "actor",
      }),
      "pm",
    );

    assert.equal(
      resolveAssignee("PROJECT_MANAGER", {
        accountOwnerId: "owner",
        projectManagerId: null,
        actorId: "actor",
      }),
      "owner",
    );
  });

  it("keeps every template internally consistent", () => {
    for (const [stageKey, templates] of Object.entries(STAGE_TASK_TEMPLATES)) {
      for (const template of templates) {
        assert.ok(template.title.length > 0, `${stageKey} has a template with no title`);
        assert.ok(template.estimatedHours > 0, `${stageKey}: "${template.title}" has no estimate`);
        assert.ok(
          template.estimatedHours <= 40,
          `${stageKey}: "${template.title}" exceeds the 40 hour work item cap`,
        );
      }
    }
  });
});
