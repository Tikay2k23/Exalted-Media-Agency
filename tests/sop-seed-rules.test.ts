import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideSeedAction, nextSeedVersion } from "../scripts/sop-seed-rules.mjs";

/**
 * The app is the source of truth for procedures.
 *
 * The failure this guards against is quiet and expensive: somebody edits a
 * procedure in Governance, has it approved, and a later seed run puts the
 * repository's stale wording back without anybody noticing the approval was
 * cleared. The rule is one line of code, so the test is about pinning the
 * behaviour rather than about the arithmetic.
 */
describe("seeding the SOP library", () => {
  it("creates a procedure the library does not have", () => {
    assert.equal(
      decideSeedAction({ existingContent: null, fileContent: "# One", replace: false }),
      "create",
    );
  });

  it("does nothing when the file and the library agree", () => {
    assert.equal(
      decideSeedAction({ existingContent: "# One", fileContent: "# One", replace: false }),
      "unchanged",
    );
  });

  it("leaves an edited procedure alone rather than reverting it", () => {
    assert.equal(
      decideSeedAction({
        existingContent: "# One, as the agency now works",
        fileContent: "# One, as it was first written",
        replace: false,
      }),
      "leave-alone",
    );
  });

  it("replaces only when the run explicitly asks for it", () => {
    assert.equal(
      decideSeedAction({
        existingContent: "# One, as the agency now works",
        fileContent: "# One, as it was first written",
        replace: true,
      }),
      "replace",
    );
  });

  it("still does nothing when a replace run finds nothing to change", () => {
    assert.equal(
      decideSeedAction({ existingContent: "# One", fileContent: "# One", replace: true }),
      "unchanged",
    );
  });

  it("treats a missing procedure as new even on a replace run", () => {
    assert.equal(
      decideSeedAction({ existingContent: null, fileContent: "# One", replace: true }),
      "create",
    );
  });
});

describe("version numbering", () => {
  it("bumps the minor part", () => {
    assert.equal(nextSeedVersion("1.0"), "1.1");
    assert.equal(nextSeedVersion("2.9"), "2.10");
  });

  it("restarts rather than writing a broken version onto the record", () => {
    assert.equal(nextSeedVersion("draft"), "1.0");
    assert.equal(nextSeedVersion("1"), "1.0");
    assert.equal(nextSeedVersion(""), "1.0");
    assert.equal(nextSeedVersion(null), "1.0");
  });
});
