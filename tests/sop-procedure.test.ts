import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parseSopDocument } from "@/lib/governance/sop-document";
import { parseProcedureSteps, procedureExceptions } from "@/lib/governance/sop-procedure";

function steps(markdown: string) {
  return parseProcedureSteps(parseSopDocument(markdown));
}

describe("reading a procedure as steps", () => {
  it("reads a step's labelled fields", () => {
    const [step] = steps(
      [
        "## Main Process",
        "",
        "### 1. Capture the Lead",
        "Short: Capture",
        "Owner: Sales Representative / Automation",
        "",
        "Create or receive the new lead from an approved source.",
        "",
        "Inputs:",
        "- Name",
        "- Lead source",
        "",
        "Result: A valid lead record exists in Sales.",
        "",
      ].join("\n"),
    );

    assert.equal(step.number, 1);
    assert.equal(step.title, "Capture the Lead");
    assert.equal(step.short, "Capture");
    assert.equal(step.owner, "Sales Representative / Automation");
    assert.deepEqual(step.inputs, ["Name", "Lead source"]);
    assert.deepEqual(step.what, ["Create or receive the new lead from an approved source."]);
    assert.equal(step.result, "A valid lead record exists in Sales.");
    assert.equal(step.hasDetail, true);
  });

  it("keeps a field that wrapped onto the next line", () => {
    /*
     * The documents wrap at 80 columns. Before this, the second line of a rule
     * was not part of the rule - it became a stray sentence in what-to-do,
     * which is how half a policy ends up displayed as an instruction.
     */
    const [step] = steps(
      [
        "## Main Process",
        "",
        "### 6. Set Next Action",
        "Rule: An active lead cannot sit in the pipeline without a documented reason and",
        "a next follow-up.",
        "",
      ].join("\n"),
    );

    assert.equal(
      step.rule,
      "An active lead cannot sit in the pipeline without a documented reason and a next follow-up.",
    );
    assert.deepEqual(step.what, []);
  });

  it("does not swallow the paragraph after a list of inputs", () => {
    const [step] = steps(
      ["## Main Process", "", "### 1. A step", "Inputs:", "- Name", "", "Then do the thing.", ""].join(
        "\n",
      ),
    );

    assert.deepEqual(step.inputs, ["Name"]);
    assert.deepEqual(step.what, ["Then do the thing."]);
  });

  it("accepts inputs written on one line", () => {
    const [step] = steps(
      ["## Main Process", "", "### 1. A step", "Inputs: Name, Email or phone", ""].join("\n"),
    );

    assert.deepEqual(step.inputs, ["Name", "Email or phone"]);
  });

  it("takes the number from the document rather than the position", () => {
    const parsed = steps(
      ["## Main Process", "", "### 4. Fourth", "Owner: A", "", "### 5. Fifth", "Owner: B", ""].join(
        "\n",
      ),
    );

    assert.deepEqual(parsed.map((step) => step.number), [4, 5]);
  });

  it("falls back to the first word of the title for the navigator", () => {
    const [step] = steps(["## Main Process", "", "### 2. Check for Duplicates", "Owner: A", ""].join("\n"));

    assert.equal(step.short, "Check");
  });

  it("still reads a procedure written as a flat numbered list", () => {
    /* Nine of the ten are still written this way and must keep working. */
    const parsed = steps("## Main Process\n1. Confirm payment.\n2. Send the intake form.\n");

    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].title, "Confirm payment.");
    assert.equal(parsed[0].owner, null);
    assert.equal(
      parsed[0].hasDetail,
      false,
      "a title-only step must not offer a control that opens nothing",
    );
  });

  it("has no steps when the document has no process section", () => {
    assert.deepEqual(steps("## Purpose\nWhy.\n"), []);
  });

  it("reads the exceptions as titled entries", () => {
    const document = parseSopDocument(
      [
        "## Exceptions and Escalation",
        "",
        "### Lead cannot be contacted",
        "Continue the approved cadence.",
        "",
        "### Duplicate record found",
        "Use the existing record.",
        "",
      ].join("\n"),
    );

    assert.deepEqual(procedureExceptions(document), [
      { title: "Lead cannot be contacted", detail: "Continue the approved cadence." },
      { title: "Duplicate record found", detail: "Use the existing record." },
    ]);
  });
});

describe("SOP-01 as written", () => {
  const document = parseSopDocument(
    readFileSync(join(process.cwd(), "docs", "sop", "SOP-01-Lead-Capture-and-Qualification.md"), "utf8"),
  );
  const parsed = parseProcedureSteps(document);

  it("has ten owned steps", () => {
    assert.equal(parsed.length, 10);

    for (const step of parsed) {
      assert.ok(step.owner, `step ${step.number} has no owner`);
      assert.ok(step.result, `step ${step.number} has no expected result`);
      assert.ok(step.what.length, `step ${step.number} says nothing about what to do`);
    }
  });

  it("numbers them one to ten", () => {
    assert.deepEqual(
      parsed.map((step) => step.number),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
  });

  it("marks a rule only where there is one", () => {
    /* Every step styled as a warning is a page with no warnings on it. */
    const withRules = parsed.filter((step) => step.rule).map((step) => step.number);

    assert.deepEqual(withRules, [2, 4, 6, 7]);
  });

  it("carries the qualification inputs", () => {
    const qualify = parsed.find((step) => step.number === 7);

    assert.ok(qualify?.inputs.includes("Budget"));
    assert.ok(qualify?.inputs.includes("Decision maker"));
  });

  it("marks the discovery call as conditional", () => {
    assert.equal(parsed.find((step) => step.number === 9)?.appliesWhen, "The lead is Qualified.");
  });

  it("lists five exceptions", () => {
    assert.equal(procedureExceptions(document).length, 5);
  });
});
