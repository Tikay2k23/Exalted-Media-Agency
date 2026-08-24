import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { A2P_SECTION, questionApplies, sectionsForService } from "@/lib/intake/question-catalogue";

/**
 * The A2P questions on the intake form.
 *
 * Two things worth holding. They are only asked of clients who will actually
 * send SMS - everybody else is spared twenty carrier questions about a
 * registration they will never need. And they are written in the client's
 * language: nobody outside this industry knows what a campaign use-case is,
 * and asking produces a worse answer than asking what they will use texting
 * for.
 */
describe("A2P intake questions", () => {
  it("is asked of a CRM client", () => {
    const ids = sectionsForService("CRM_AUTOMATION").map((section) => section.id);

    assert.ok(ids.includes("a2p"));
  });

  it("is not asked of a website-only client", () => {
    const ids = sectionsForService("WEBSITE_SUPPORT").map((section) => section.id);

    assert.equal(ids.includes("a2p"), false);
  });

  it("never asks for a password", () => {
    for (const question of A2P_SECTION.questions) {
      assert.doesNotMatch(
        `${question.label} ${question.help ?? ""}`,
        /password|passcode|login details/i,
        `"${question.label}" asks for credentials, which never belong in a form`,
      );
    }
  });

  it("avoids carrier jargon in what it asks", () => {
    for (const question of A2P_SECTION.questions) {
      assert.doesNotMatch(
        question.label,
        /\b(10DLC|A2P campaign|brand vetting|throughput|use-case)\b/i,
        `"${question.label}" uses vocabulary a client has no reason to know`,
      );
    }
  });

  it("offers real choices for anything it asks to be picked", () => {
    for (const question of A2P_SECTION.questions) {
      if (question.kind === "choice" || question.kind === "multi") {
        assert.ok(
          (question.options?.length ?? 0) >= 2,
          `${question.id} asks for a choice with nothing to choose from`,
        );
      }
    }
  });
});

/**
 * Conditional questions.
 *
 * A business collecting consent on paper has no website checkbox to describe,
 * and one sending no marketing has no promotional message to write. Asking
 * either would leave them unable to finish a form they answered honestly.
 */
describe("conditional questions", () => {
  const checkbox = A2P_SECTION.questions.find((q) => q.id === "a2pCheckboxOptional")!;
  const marketing = A2P_SECTION.questions.find((q) => q.id === "a2pSampleMarketing")!;

  it("hides the website consent questions from a paper-form business", () => {
    assert.equal(questionApplies(checkbox, { a2pOptInMethods: "PAPER_FORM,IN_PERSON" }), false);
  });

  it("shows them once anybody opts in on the web", () => {
    assert.equal(
      questionApplies(checkbox, { a2pOptInMethods: "PAPER_FORM,WEBSITE_FORM" }),
      true,
    );
  });

  it("hides the marketing sample until they say they will market", () => {
    assert.equal(questionApplies(marketing, { a2pUseCases: "APPOINTMENT_REMINDER" }), false);
    assert.equal(
      questionApplies(marketing, { a2pUseCases: "APPOINTMENT_REMINDER,MARKETING_PROMOTION" }),
      true,
    );
  });

  it("treats an unconditional question as always asked", () => {
    const legalName = A2P_SECTION.questions.find((q) => q.id === "a2pLegalName")!;

    assert.equal(questionApplies(legalName, null), true);
    assert.equal(questionApplies(legalName, {}), true);
  });

  it("hides a conditional question when nothing has been answered yet", () => {
    assert.equal(questionApplies(checkbox, null), false);
  });
});
