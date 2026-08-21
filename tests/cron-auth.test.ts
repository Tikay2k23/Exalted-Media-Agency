import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

/**
 * Who is allowed to run the nightly sweep.
 *
 * This endpoint is on the public internet and it writes notifications to real
 * people, so the guard is the only thing between a stranger and everybody's
 * notification list. Worth testing properly rather than by eye.
 *
 * The route is imported lazily inside each case because the guard reads
 * process.env at call time, and a module imported once at the top would
 * otherwise capture whatever the first test happened to set.
 */

const ORIGINAL = process.env.CRON_SECRET;

async function callWith(headers: Record<string, string>) {
  const { GET } = await import("@/app/api/cron/deadline-sweep/route");

  return GET(new Request("https://example.test/api/cron/deadline-sweep", { headers }));
}

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL;
  }
});

describe("the deadline sweep endpoint", () => {
  it("refuses to run at all when no secret is configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await callWith({});

    assert.equal(
      response.status,
      503,
      "a missing secret must close the endpoint, not open it",
    );
  });

  it("turns away a caller with no credentials", async () => {
    process.env.CRON_SECRET = "test-secret-value";

    const response = await callWith({});

    assert.equal(response.status, 401);
  });

  it("turns away a caller with the wrong secret", async () => {
    process.env.CRON_SECRET = "test-secret-value";

    const response = await callWith({ authorization: "Bearer wrong-value" });

    assert.equal(response.status, 401);
  });

  it("is not fooled by a prefix of the real secret", async () => {
    process.env.CRON_SECRET = "test-secret-value";

    const response = await callWith({ authorization: "Bearer test-secret" });

    assert.equal(response.status, 401);
  });

  it("wants the Bearer scheme, not the bare secret", async () => {
    process.env.CRON_SECRET = "test-secret-value";

    const response = await callWith({ authorization: "test-secret-value" });

    assert.equal(response.status, 401);
  });
});
