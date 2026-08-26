import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runAutomationStep } from "@/lib/journey/automation-runs";

/**
 * Recording what a transition set in motion.
 *
 * These steps run after the stage move has committed. The behaviour that
 * matters is not the logging - it is that a step which fails cannot travel out
 * of the call and tell the caller the move failed while the client sits in the
 * new stage.
 */

/** A stand-in for the client, so the maths can be checked without a database. */
function recorder() {
  const rows: Record<string, unknown>[] = [];

  return {
    rows,
    client: {
      stageAutomationRun: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          rows.push(data);
          return data;
        },
      },
    } as never,
  };
}

describe("running one step of a transition", () => {
  it("returns what the step produced", async () => {
    const { client } = recorder();

    const result = await runAutomationStep(
      { clientId: "c1", historyId: "h1", action: "NOTIFY" },
      async () => ({ sent: 3 }),
      client,
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { sent: 3 });
    assert.equal(result.error, null);
  });

  it("writes down that it succeeded", async () => {
    const { rows, client } = recorder();

    await runAutomationStep(
      { clientId: "c1", historyId: "h1", action: "RECORD_HANDOFF" },
      async () => ({ id: "handoff-1" }),
      client,
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "SUCCEEDED");
    assert.equal(rows[0].action, "RECORD_HANDOFF");
    assert.equal(rows[0].lastError, undefined);
    assert.ok(rows[0].completedAt);
  });

  it("records what the step produced, so the effect can be found again", async () => {
    const { rows, client } = recorder();

    await runAutomationStep(
      {
        clientId: "c1",
        historyId: "h1",
        action: "GENERATE_TASKS",
        idsOf: (value: { ids: string[] }) => value.ids,
      },
      async () => ({ ids: ["t1", "t2", "t3"] }),
      client,
    );

    assert.deepEqual(rows[0].generatedIds, ["t1", "t2", "t3"]);
  });

  /*
   * The point of the whole thing. Everything here runs against an account that
   * has already moved, so a throw travelling out would tell the caller the move
   * failed while the client sits in the new stage - worse than either
   * succeeding or failing outright, because nobody would go looking.
   */
  it("never throws, however badly the step fails", async () => {
    const { client } = recorder();

    const result = await runAutomationStep(
      { clientId: "c1", historyId: "h1", action: "NOTIFY" },
      async () => {
        throw new Error("the notification service is down");
      },
      client,
    );

    assert.equal(result.ok, false);
    assert.equal(result.value, null);
    assert.match(result.error ?? "", /notification service is down/);
  });

  it("writes the failure down with what broke", async () => {
    const { rows, client } = recorder();

    await runAutomationStep(
      { clientId: "c1", historyId: "h1", action: "NOTIFY" },
      async () => {
        throw new Error("SMTP refused the connection");
      },
      client,
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "FAILED");
    assert.match(String(rows[0].lastError), /SMTP refused/);
    assert.deepEqual(rows[0].generatedIds, []);
  });

  it("keeps the message rather than a stack trace", async () => {
    const { rows, client } = recorder();

    await runAutomationStep(
      { clientId: "c1", historyId: null, action: "SYNC_WORKSTREAMS" },
      async () => {
        throw new Error("seat missing");
      },
      client,
    );

    // Somebody reading the log needs to know what broke, not where.
    assert.equal(rows[0].lastError, "seat missing");
    assert.doesNotMatch(String(rows[0].lastError), /at .*\(/);
  });

  it("still does not throw when it cannot even record the failure", async () => {
    // If the database is the thing that broke there is nowhere to write this
    // down, and the move still stands.
    const broken = {
      stageAutomationRun: {
        create: async () => {
          throw new Error("database unreachable");
        },
      },
    } as never;

    const result = await runAutomationStep(
      { clientId: "c1", historyId: "h1", action: "NOTIFY" },
      async () => {
        throw new Error("original failure");
      },
      broken,
    );

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /original failure/);
  });

  it("reports a step that worked as worked, even if the note about it failed", async () => {
    const broken = {
      stageAutomationRun: {
        create: async () => {
          throw new Error("database unreachable");
        },
      },
    } as never;

    const result = await runAutomationStep(
      { clientId: "c1", historyId: "h1", action: "NOTIFY" },
      async () => ({ sent: 1 }),
      broken,
    );

    // The step itself worked; only the note about it did not. Reporting a
    // failure here would send somebody to fix something that is not broken.
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { sent: 1 });
  });
});
