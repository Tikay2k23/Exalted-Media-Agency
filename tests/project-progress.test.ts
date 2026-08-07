import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type ProgressMilestone,
  deriveProjectProgress,
} from "@/lib/delivery/project-service";

const NOW = new Date("2026-08-06");
const PAST = new Date("2026-08-01");
const FUTURE = new Date("2026-09-01");

function milestone(overrides: Partial<ProgressMilestone> = {}): ProgressMilestone {
  return {
    name: "Milestone",
    position: 0,
    dueDate: null,
    completedAt: null,
    ...overrides,
  };
}

describe("project progress", () => {
  it("reports nothing for a project with no milestones", () => {
    const progress = deriveProjectProgress([], NOW);

    assert.equal(progress.percentComplete, 0);
    assert.equal(progress.totalCount, 0);
    assert.equal(progress.currentMilestone, null);
    assert.equal(progress.nextMilestone, null);
  });

  it("computes a percentage from completed milestones", () => {
    const progress = deriveProjectProgress(
      [
        milestone({ name: "One", position: 0, completedAt: PAST }),
        milestone({ name: "Two", position: 1, completedAt: PAST }),
        milestone({ name: "Three", position: 2 }),
        milestone({ name: "Four", position: 3 }),
      ],
      NOW,
    );

    assert.equal(progress.percentComplete, 50);
    assert.equal(progress.completedCount, 2);
    assert.equal(progress.totalCount, 4);
  });

  it("names the current and next outstanding milestone in order", () => {
    const progress = deriveProjectProgress(
      [
        milestone({ name: "Design", position: 0, completedAt: PAST }),
        milestone({ name: "Build", position: 1 }),
        milestone({ name: "Launch", position: 2 }),
      ],
      NOW,
    );

    assert.equal(progress.currentMilestone, "Build");
    assert.equal(progress.nextMilestone, "Launch");
  });

  it("respects position rather than the order it was handed the milestones", () => {
    const progress = deriveProjectProgress(
      [
        milestone({ name: "Launch", position: 2 }),
        milestone({ name: "Build", position: 1 }),
        milestone({ name: "Design", position: 0 }),
      ],
      NOW,
    );

    assert.equal(progress.currentMilestone, "Design");
    assert.equal(progress.nextMilestone, "Build");
  });

  it("reaches 100 per cent only when every milestone is done", () => {
    const progress = deriveProjectProgress(
      [
        milestone({ name: "One", position: 0, completedAt: PAST }),
        milestone({ name: "Two", position: 1, completedAt: PAST }),
      ],
      NOW,
    );

    assert.equal(progress.percentComplete, 100);
    assert.equal(progress.currentMilestone, null);
  });

  it("counts only outstanding milestones as overdue", () => {
    const progress = deriveProjectProgress(
      [
        // Late but finished: this is history, not a problem.
        milestone({ name: "Late but done", position: 0, dueDate: PAST, completedAt: NOW }),
        milestone({ name: "Late and open", position: 1, dueDate: PAST }),
        milestone({ name: "Not due yet", position: 2, dueDate: FUTURE }),
        milestone({ name: "No date", position: 3 }),
      ],
      NOW,
    );

    assert.equal(progress.overdueCount, 1);
  });

  it("rounds to a whole percentage", () => {
    const progress = deriveProjectProgress(
      [
        milestone({ position: 0, completedAt: PAST }),
        milestone({ position: 1 }),
        milestone({ position: 2 }),
      ],
      NOW,
    );

    assert.equal(progress.percentComplete, 33);
    assert.equal(Number.isInteger(progress.percentComplete), true);
  });

  it("does not mutate the milestones it was given", () => {
    const milestones = [
      milestone({ name: "Second", position: 1 }),
      milestone({ name: "First", position: 0 }),
    ];

    deriveProjectProgress(milestones, NOW);

    assert.equal(milestones[0].name, "Second");
  });
});
