import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  A2P_SECTION,
  questionApplies,
  sectionsForService,
} from "@/lib/intake/question-catalogue";

/**
 * The A2P questions on the intake form.
 *
 * Every client is offered the section, and one question decides the rest: a
 * client who does not want text messaging answers no and sees nothing further,
 * so nobody is spared the offer but nobody is buried in carrier questions they
 * will never need.
 *
 * They are written in the client's language. Nobody outside this industry
 * knows what a campaign use-case is, and asking produces a worse answer than
 * asking what they will use texting for.
 */
describe("A2P intake questions", () => {
  it("is offered to every client, whatever they bought", () => {
    for (const service of ["CRM_AUTOMATION", "WEBSITE_SUPPORT", "SEO"] as const) {
      const ids = sectionsForService(service).map((section) => section.id);

      assert.ok(ids.includes("a2p"), `${service} should be offered the section`);
    }
  });

  it("shows only the gate question until somebody says yes", () => {
    const visible = A2P_SECTION.questions.filter((question) =>
      questionApplies(question, null),
    );

    assert.deepEqual(
      visible.map((question) => question.id),
      ["a2pWantsSms"],
      "an unanswered form should ask one question, not twenty",
    );
  });

  it("opens the rest once they say yes", () => {
    const visible = A2P_SECTION.questions.filter((question) =>
      questionApplies(question, { a2pWantsSms: "yes" }),
    );

    assert.ok(visible.length > 10, "saying yes should reveal the registration questions");
    assert.ok(visible.some((question) => question.id === "a2pLegalName"));
  });

  it("closes again if they say no", () => {
    const visible = A2P_SECTION.questions.filter((question) =>
      questionApplies(question, { a2pWantsSms: "no", a2pUseCases: "MARKETING_PROMOTION" }),
    );

    assert.deepEqual(
      visible.map((question) => question.id),
      ["a2pWantsSms"],
      "a stale answer to a hidden question must not drag it back on screen",
    );
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

  /** Everything below the gate needs it answered yes as well as its own rule. */
  const wants = { a2pWantsSms: "yes" };

  it("hides the website consent questions from a paper-form business", () => {
    assert.equal(
      questionApplies(checkbox, { ...wants, a2pOptInMethods: "PAPER_FORM,IN_PERSON" }),
      false,
    );
  });

  it("shows them once anybody opts in on the web", () => {
    assert.equal(
      questionApplies(checkbox, { ...wants, a2pOptInMethods: "PAPER_FORM,WEBSITE_FORM" }),
      true,
    );
  });

  it("still hides them if the client does not want texting at all", () => {
    assert.equal(
      questionApplies(checkbox, { a2pWantsSms: "no", a2pOptInMethods: "WEBSITE_FORM" }),
      false,
      "both conditions have to hold, not either",
    );
  });

  it("hides the marketing sample until they say they will market", () => {
    assert.equal(
      questionApplies(marketing, { ...wants, a2pUseCases: "APPOINTMENT_REMINDER" }),
      false,
    );
    assert.equal(
      questionApplies(marketing, {
        ...wants,
        a2pUseCases: "APPOINTMENT_REMINDER,MARKETING_PROMOTION",
      }),
      true,
    );
  });

  it("treats an unconditional question as always asked", () => {
    // The gate itself is the only question in the section with no condition.
    const gate = A2P_SECTION.questions.find((q) => q.id === "a2pWantsSms")!;

    assert.equal(questionApplies(gate, null), true);
    assert.equal(questionApplies(gate, {}), true);
  });

  it("hides a conditional question when nothing has been answered yet", () => {
    assert.equal(questionApplies(checkbox, null), false);
  });
});
