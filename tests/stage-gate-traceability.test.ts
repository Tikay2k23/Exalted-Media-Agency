import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { STAGE_REQUIREMENT_SEED, getRequirementDefinition } from "@/lib/journey/stage-requirements";

/**
 * Every stage gate has to be traceable to a written procedure.
 *
 * The gates are the strictest rules in the product - nine of them stand
 * between an account and In Production - and for a while they cited an "SOP
 * section 10" that does not exist in the library. Nobody could check whether
 * the rules being enforced were the rules anybody agreed to.
 *
 * docs/sop/STAGE-GATES.md is the trace. This keeps the two in step: add a gate
 * to the seed without documenting it and the suite fails, and so does leaving
 * an entry behind for a gate that has since been removed.
 *
 * What this cannot check is whether a citation is right - only that one is
 * there. A wrong citation is caught by reading, not by a test, which is why
 * the page records the date it was last read.
 */

const DOC_PATH = "docs/sop/STAGE-GATES.md";
const doc = readFileSync(DOC_PATH, "utf8");

/** Requirement keys are written in the document as `snake_case` in backticks. */
function documentedKeys(): Set<string> {
  const keys = new Set<string>();

  for (const match of doc.matchAll(/`([a-z][a-z0-9_]*)`/g)) {
    keys.add(match[1]);
  }

  return keys;
}

const flatten = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The document read as pairs, not as a bag of words.
 *
 * Each `###` section is one stage, and the requirement keys inside it are the
 * gates traced for that stage. Checking pairs rather than keys is what stops a
 * gate being moved to another stage without the trace following it - the key
 * would still appear somewhere in the file and a looser check would pass.
 */
function documentedPairs(): Set<string> {
  const pairs = new Set<string>();

  for (const section of doc.split(/^### /m).slice(1)) {
    const heading = flatten(section.slice(0, section.indexOf(String.fromCharCode(10))));

    for (const match of section.matchAll(/`([a-z][a-z0-9_]*)`/g)) {
      if (getRequirementDefinition(match[1])) pairs.add(`${heading}::${match[1]}`);
    }
  }

  return pairs;
}

/** in_production -> "In Production", so a heading can read the way the product does. */
const headingFor = (stageKey: string) =>
  stageKey
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

const seeded = new Set(Object.values(STAGE_REQUIREMENT_SEED).flat());

describe("stage gate traceability", () => {
  it("traces every requirement to the stage that enforces it", () => {
    const documented = documentedPairs();
    const missing: string[] = [];

    for (const [stageKey, requirements] of Object.entries(STAGE_REQUIREMENT_SEED)) {
      for (const requirement of requirements) {
        const pair = `${flatten(headingFor(stageKey))}::${requirement}`;

        if (!documented.has(pair)) missing.push(`${stageKey} -> ${requirement}`);
      }
    }

    assert.deepEqual(missing.sort(), [], `not traced in ${DOC_PATH}: ${missing.join("; ")}`);
  });

  it("documents every stage that has gates", () => {
    /*
     * Compared with punctuation removed. The board writes one stage as
     * "Live / Active", and a heading is allowed to read the way the product
     * reads rather than the way the key is spelled.
     */
    const flatDoc = flatten(doc);
    const missing = Object.keys(STAGE_REQUIREMENT_SEED).filter(
      (stageKey) => !flatDoc.includes(flatten(headingFor(stageKey))),
    );

    assert.deepEqual(missing, [], `stages with gates but no section: ${missing.join(", ")}`);
  });

  it("carries no entry for a requirement that no longer exists", () => {
    /*
     * The other direction. A gate removed from the seed leaves a paragraph
     * behind describing a rule the system no longer has, which is worse than
     * no paragraph - somebody will plan around it.
     *
     * Only keys the requirement registry knows about are considered, so
     * ordinary backticked code in the prose does not trip this.
     */
    const stale = [...documentedKeys()].filter(
      (key) => Boolean(getRequirementDefinition(key)) && !seeded.has(key),
    );

    assert.deepEqual(stale, [], `documented but no longer seeded: ${stale.join(", ")}`);
  });

  it("keeps the section that would name a gate with no written source", () => {
    /*
     * Three gates were enforced without any SOP step calling for them. The
     * step was written into the SOP rather than a citation found to fit, so
     * the section is empty now - but it stays, because the next gate added
     * without a source belongs in it. Deleting the heading is how that finding
     * would quietly stop being reported.
     */
    assert.match(doc, /## Gates with no written source/);
  });
});
