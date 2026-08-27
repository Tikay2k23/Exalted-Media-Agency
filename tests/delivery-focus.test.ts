import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TaskTiming } from "@/lib/clients/client-work";
import {
  deliveryFocus,
  type DeliveryInput,
} from "@/lib/journey/delivery-focus";
import {
  REQUIREMENT_ROUTES,
  requirementRoute,
} from "@/lib/journey/requirement-routes";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const day = (offset: number) =>
  new Date(NOW.getTime() + offset * 86_400_000).toISOString();

function task(overrides: Partial<TaskTiming> & { id?: string } = {}): TaskTiming & { id: string } {
  return {
    id: "t1",
    status: "IN_PROGRESS",
    dueDate: day(3),
    archivedAt: null,
    ...overrides,
  };
}

function input(overrides: Partial<DeliveryInput> = {}): DeliveryInput {
  return {
    tasks: [],
    blockers: [],
    waitingOnClient: 0,
    blockingRequirements: 0,
    nextStageName: "Internal Quality Assurance",
    projects: [],
    now: NOW,
    ...overrides,
  };
}

const blocker = (blocksStage: boolean) => ({
  id: "b1",
  reason: "Client's host will not grant DNS access",
  severity: "HIGH",
  blocksStage,
});

/**
 * Priority.
 *
 * The whole point of the module. A reassuring headline sitting on top of a
 * blocker is the failure being fixed, so every one of these asserts that a
 * worse state wins over a better one rather than merely that each state can be
 * produced in isolation.
 */
describe("delivery focus priority", () => {
  it("puts a stage blocker above everything else", () => {
    const result = deliveryFocus(
      input({
        blockers: [blocker(true)],
        tasks: [task({ id: "a", dueDate: day(-4) }), task({ id: "b" })],
        waitingOnClient: 3,
        blockingRequirements: 2,
      }),
    );

    assert.equal(result.key, "RESOLVE_BLOCKER");
    assert.equal(result.actions[0].key, "view-blocker");
    // The reason travels with it: a card that says "a blocker exists" and
    // makes somebody open a drawer to find out which one has wasted the click.
    assert.match(result.description, /DNS access/);
  });

  it("ignores a blocker that does not hold the stage", () => {
    const result = deliveryFocus(
      input({ blockers: [blocker(false)], tasks: [task()] }),
    );

    assert.equal(result.key, "BUILD");
  });

  it("puts overdue work above open work and above waiting on client", () => {
    const result = deliveryFocus(
      input({
        tasks: [task({ id: "late", dueDate: day(-2) }), task({ id: "fine" })],
        waitingOnClient: 2,
      }),
    );

    assert.equal(result.key, "DELIVERY_RECOVERY");
    assert.equal(result.actions[0].key, "review-overdue");
    assert.match(result.description, /1 task is overdue/);
  });

  it("puts waiting on client above ordinary build", () => {
    const result = deliveryFocus(input({ tasks: [task()], waitingOnClient: 1 }));

    assert.equal(result.key, "WAITING_ON_CLIENT");
    assert.equal(result.actions[0].key, "contacts-to-chase");
  });

  it("shows ordinary build when work is open and nothing is wrong", () => {
    const result = deliveryFocus(input({ tasks: [task(), task({ id: "t2" })] }));

    assert.equal(result.key, "BUILD");
    assert.equal(result.title, "Focus: Build / Implementation");
    assert.deepEqual(
      result.actions.map((action) => action.key),
      ["tasks-and-delivery", "projects"],
    );
  });

  it("moves to QA readiness when work is done but gates remain", () => {
    const result = deliveryFocus(
      input({
        tasks: [task({ status: "DONE" })],
        blockingRequirements: 1,
      }),
    );

    assert.equal(result.key, "QA_READINESS");
    assert.equal(result.actions[0].key, "complete-requirements");
    assert.match(result.description, /1 requirement/);
    assert.match(result.description, /Internal Quality Assurance/);
  });

  it("offers the advance only when work and gates are both clear", () => {
    const result = deliveryFocus(
      input({ tasks: [task({ status: "APPROVED" })] }),
    );

    assert.equal(result.key, "READY_FOR_QA");
    assert.equal(result.actions[0].key, "advance-stage");
    assert.match(result.actions[0].label, /Advance to Internal Quality Assurance/);
  });

  it("does not offer an advance when there is nowhere to advance to", () => {
    /*
     * The ready arm is the fallthrough, so it also catches an account at the
     * end of the journey. It used to offer "Advance to the next stage" there,
     * and the dialog behind that button needs a next stage - so it opened
     * nothing at all.
     */
    const result = deliveryFocus(input({ nextStageName: null }));

    assert.equal(result.key, "JOURNEY_COMPLETE");
    assert.equal(
      result.actions.some((action) => action.key === "advance-stage"),
      false,
    );
  });

  it("never labels a button after a stage that is not there", () => {
    for (const next of [null, "Internal Quality Assurance"]) {
      const result = deliveryFocus(input({ nextStageName: next }));

      for (const action of result.actions) {
        assert.doesNotMatch(action.label, /the next stage/i);
      }
    }
  });

  it("never claims readiness while a gate is unmet", () => {
    // The coordination rule: this card and Next Best Action read the same
    // count, so one cannot say ready while the other says one to go.
    for (const tasks of [[], [task({ status: "DONE" })]]) {
      const result = deliveryFocus(input({ tasks, blockingRequirements: 1 }));

      assert.notEqual(result.key, "READY_FOR_QA");
    }
  });
});

/**
 * The counts.
 *
 * Shared with the Work tab through the same predicates, so a reader clicking
 * "2 overdue" lands on two rows.
 */
describe("delivery counts", () => {
  it("counts open and overdue from the shared task predicates", () => {
    const result = deliveryFocus(
      input({
        tasks: [
          task({ id: "a", dueDate: day(-3) }),
          task({ id: "b", dueDate: day(-1) }),
          task({ id: "c", dueDate: day(5) }),
          task({ id: "d", status: "DONE", dueDate: day(-9) }),
        ],
      }),
    );

    const open = result.counts.find((count) => count.label === "Open work");
    const overdue = result.counts.find((count) => count.label === "Overdue");

    assert.equal(open?.value, 3);
    // The closed task is late but finished, so it is not chasing anybody.
    assert.equal(overdue?.value, 2);
  });

  it("does not count archived work as open", () => {
    const result = deliveryFocus(
      input({ tasks: [task({ archivedAt: day(-1), dueDate: day(-5) })] }),
    );

    assert.equal(result.counts.find((count) => count.label === "Open work")?.value, 0);
    assert.equal(result.counts.find((count) => count.label === "Overdue")?.value, 0);
  });

  it("gives every count either a Work filter or none, never a wrong one", () => {
    const result = deliveryFocus(
      input({ tasks: [task({ status: "BLOCKED" })], waitingOnClient: 2 }),
    );

    const waiting = result.counts.find((count) => count.label === "Waiting on client");
    const blocked = result.counts.find((count) => count.label === "Blocked");

    // Waiting on client comes from raised conditions, not task status - the
    // Work tab has no filter that would show the same set.
    assert.equal(waiting?.metric, null);
    assert.equal(blocked?.metric, "blocked");

    // And says what it counts: these are requests, not tasks.
    assert.equal(waiting?.unit, "request");
    assert.equal(blocked?.unit, "task");
  });

  it("hides the blocked and waiting counters when there is nothing to say", () => {
    const result = deliveryFocus(input({ tasks: [task()] }));

    assert.deepEqual(
      result.counts.map((count) => count.label),
      ["Open work", "Overdue"],
    );
  });
});

/**
 * The production target.
 *
 * The card carried "production target date still realistic" as a fixed bullet.
 * It is now read from the projects and the work.
 */
describe("production target", () => {
  it("is unknown rather than fine when no project has a target date", () => {
    const result = deliveryFocus(input({ tasks: [task()] }));

    assert.equal(result.targetHealth, "UNKNOWN");
    assert.match(result.targetNote, /No project target date/i);
  });

  it("is on track when a dated project has no overdue work behind it", () => {
    const result = deliveryFocus(
      input({
        tasks: [task()],
        projects: [
          { id: "p", name: "Funnel", status: "ACTIVE", targetDate: day(20), openTasks: 2, overdueTasks: 0 },
        ],
      }),
    );

    assert.equal(result.targetHealth, "ON_TRACK");
  });

  it("is delayed once a target has passed with work still open", () => {
    const result = deliveryFocus(
      input({
        projects: [
          { id: "p", name: "Funnel", status: "ACTIVE", targetDate: day(-5), openTasks: 3, overdueTasks: 1 },
        ],
      }),
    );

    assert.equal(result.targetHealth, "DELAYED");
  });

  it("does not call a finished project delayed for having passed its date", () => {
    const result = deliveryFocus(
      input({
        projects: [
          { id: "p", name: "Funnel", status: "COMPLETED", targetDate: day(-5), openTasks: 0, overdueTasks: 0 },
        ],
      }),
    );

    assert.notEqual(result.targetHealth, "DELAYED");
  });

  it("is at risk when a blocker holds the stage", () => {
    const result = deliveryFocus(
      input({
        blockers: [blocker(true)],
        projects: [
          { id: "p", name: "Funnel", status: "ACTIVE", targetDate: day(20), openTasks: 1, overdueTasks: 0 },
        ],
      }),
    );

    assert.equal(result.targetHealth, "AT_RISK");
  });
});

/**
 * Requirement routing.
 *
 * A requirement is a condition evaluated against real records, so the only
 * honest action is the screen that owns the record.
 */
describe("requirement routes", () => {
  it("sends every task-completion gate to the work it counts", () => {
    for (const key of [
      "onboarding_tasks_complete",
      "strategy_tasks_complete",
      "production_work_complete",
      "qa_tasks_complete",
      "revisions_complete",
      "launch_tasks_complete",
      "no_open_work",
    ]) {
      const route = requirementRoute(key);

      assert.equal(route.tab, "tasks", `${key} should route at the Work tab`);
      assert.equal(route.metric, "active", `${key} should arrive filtered to open work`);
    }
  });

  it("routes an unmapped key somewhere real rather than nowhere", () => {
    const route = requirementRoute("a_gate_added_next_year");

    assert.equal(route.tab, "overview");
    assert.ok(route.action.length > 0);
    assert.ok(route.how.length > 0);
  });

  it("gives every mapped route an action and an explanation", () => {
    for (const [key, route] of Object.entries(REQUIREMENT_ROUTES)) {
      assert.ok(route.action.length > 3, `${key} has no action label`);
      assert.ok(route.how.length > 10, `${key} does not say how it is met`);
    }
  });

  it("never offers a completion action, because there is nothing to complete", () => {
    /*
     * Deliberate. These gates are evaluated against records; a Mark Complete
     * here would be a second source of truth that could say "production work
     * complete" while the tasks it counts were open.
     */
    for (const route of Object.values(REQUIREMENT_ROUTES)) {
      assert.doesNotMatch(route.action, /mark complete|mark as done/i);
    }
  });
});
