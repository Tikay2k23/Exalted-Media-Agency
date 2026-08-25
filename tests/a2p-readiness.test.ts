import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  a2pApplies,
  a2pInPlay,
  a2pRequested,
  a2pChecklist,
  a2pReadiness,
  sampleMessageWarnings,
  suggestedStatus,
  type A2PProfileShape,
} from "@/lib/a2p/a2p-readiness";

/**
 * A2P readiness.
 *
 * Two properties matter more than the arithmetic.
 *
 * The first is that it never claims an outcome. Readiness measures what the
 * agency has collected; a carrier's answer is a separate event that has not
 * happened yet and can be no. Nothing here may read as approval.
 *
 * The second is that conditional items only count when they apply - a business
 * that will never send marketing must be able to reach full without a marketing
 * sample, or the number stops being worth looking at.
 */

const complete: A2PProfileShape = {
  legalName: "Riverbend Orthodontics LLC",
  entityType: "LLC",
  countryOfRegistration: "United States",
  taxId: "12-3456789",
  addressLine1: "12 Bridge St",
  city: "Austin",
  stateRegion: "TX",
  postalCode: "78701",
  businessPhone: "(555) 111 1000",
  businessEmail: "info@riverbend.test",
  websiteUrl: "https://riverbend.test",
  representativeName: "Dr. Omar Haddad",
  representativeEmail: "omar@riverbend.test",
  representativePhone: "(555) 111 1077",
  authorisationConfirmedAt: new Date(),
  useCases: ["APPOINTMENT_REMINDER"],
  clientCampaignDescription: "Appointment reminders for booked patients.",
  reviewedCampaignDescription: "Riverbend sends appointment reminders to booked patients.",
  monthlyVolume: "500",
  messagesContainLinks: false,
  optInMethods: ["PAPER_FORM"],
  consentLanguage: "I agree to receive SMS from Riverbend Orthodontics.",
  privacyPolicyUrl: "https://riverbend.test/privacy",
  termsUrl: "https://riverbend.test/terms",
  repliesHandledBy: "Front desk",
  businessHours: "Mon-Fri 8-5",
  samples: [{ category: "TRANSACTIONAL", body: "Riverbend: your appointment is Tuesday at 2pm." }],
  documents: ["EIN_CONFIRMATION"],
};

/**
 * Who gets asked, and who gets a registration.
 *
 * These used to be the same question, answered by service type. They are not:
 * every client is asked whether they want text messaging, and their answer -
 * not which of ten labels sits on their record - decides whether there is
 * anything to register. A roofer on paid ads who wants missed-call text back
 * was invisible under the old rule.
 */
describe("who gets asked about A2P", () => {
  it("asks every client, whatever they bought", () => {
    for (const service of ["CRM_AUTOMATION", "WEBSITE_SUPPORT", "SEO", "BRAND_STRATEGY"] as const) {
      assert.equal(a2pApplies([service]), true, `${service} should still be asked`);
    }
  });
});

describe("who actually needs a registration", () => {
  it("nobody, until they say so", () => {
    assert.equal(a2pRequested(null), false);
    assert.equal(a2pRequested({}), false);
    assert.equal(a2pRequested({ a2pWantsSms: "no" }), false);
  });

  it("the client who asked for it", () => {
    assert.equal(a2pRequested({ a2pWantsSms: "yes" }), true);
  });

  it("and anyone whose profile somebody already started", () => {
    // Started before the form came back: it must not vanish because the
    // answer is still blank.
    assert.equal(a2pInPlay(null, true), true);
    assert.equal(a2pInPlay({ a2pWantsSms: "no" }, true), true);
  });

  it("but not a client with neither", () => {
    assert.equal(a2pInPlay(null, false), false);
    assert.equal(a2pInPlay({ a2pWantsSms: "no" }, false), false);
  });
});

describe("readiness", () => {
  it("reads an empty profile as nothing collected", () => {
    const readiness = a2pReadiness({});

    assert.equal(readiness.percent, 0);
    assert.ok(readiness.total > 0);
    assert.equal(readiness.missing.length, readiness.total);
  });

  it("reaches full on a paper-consent client with one transactional sample", () => {
    const readiness = a2pReadiness(complete);

    assert.equal(readiness.percent, 100, JSON.stringify(readiness.missing));
    assert.deepEqual(readiness.missing, []);
  });

  it("never says approved, compliant or guaranteed", () => {
    const headline = a2pReadiness(complete).headline.toLowerCase();

    for (const forbidden of ["approved", "compliant", "guarantee", "accepted"]) {
      assert.equal(
        headline.includes(forbidden),
        false,
        `readiness must not claim "${forbidden}" - a carrier decides that`,
      );
    }
    assert.match(headline, /ready for internal submission review/);
  });

  it("does not ask a paper-consent client about a website checkbox", () => {
    const labels = a2pChecklist(complete).map((item) => item.label);

    assert.equal(labels.includes("Consent checkbox is optional"), false);
    assert.equal(labels.includes("Opt-in screenshot"), false);
  });

  it("does ask once they opt in on a website", () => {
    const labels = a2pChecklist({
      ...complete,
      optInMethods: ["WEBSITE_FORM"],
    }).map((item) => item.label);

    assert.ok(labels.includes("Consent checkbox is optional"));
    assert.ok(labels.includes("Consent checkbox is unticked by default"));
    assert.ok(labels.includes("Opt-in screenshot"));
  });

  it("counts a website opt-in client short until the checkbox rules are met", () => {
    const readiness = a2pReadiness({ ...complete, optInMethods: ["WEBSITE_FORM"] });

    assert.ok(readiness.percent < 100);
    assert.ok(
      readiness.missing.some((item) => item.label.includes("unticked by default")),
    );
  });

  it("does not require a marketing sample from somebody sending none", () => {
    const labels = a2pChecklist(complete).map((item) => item.label);

    assert.equal(labels.includes("A marketing example"), false);
  });

  it("requires one as soon as they say they will market", () => {
    const readiness = a2pReadiness({
      ...complete,
      useCases: ["APPOINTMENT_REMINDER", "MARKETING_PROMOTION"],
    });

    assert.ok(readiness.missing.some((item) => item.label === "A marketing example"));
    assert.ok(readiness.percent < 100);
  });

  it("groups what is outstanding by section", () => {
    const readiness = a2pReadiness({});
    const identity = readiness.bySection.find((s) => s.section === "BUSINESS_IDENTITY");

    assert.ok(identity);
    assert.equal(identity.complete, 0);
    assert.ok(identity.total >= 5);
  });

  it("treats a false answer as answered, not as missing", () => {
    // "Do your messages contain links?" answered No is a complete answer.
    const withAnswer = a2pReadiness({ ...complete, messagesContainLinks: false });
    const without = a2pReadiness({ ...complete, messagesContainLinks: null });

    assert.equal(withAnswer.percent, 100);
    assert.ok(without.percent < 100);
  });
});

describe("sample message warnings", () => {
  it("flags a message that never names the business", () => {
    const warnings = sampleMessageWarnings({
      ...complete,
      samples: [{ category: "TRANSACTIONAL", body: "Your appointment is Tuesday at 2pm." }],
    });

    assert.ok(warnings.some((w) => /business name/i.test(w.warning)));
  });

  it("says nothing about a message that does name it", () => {
    assert.deepEqual(sampleMessageWarnings(complete), []);
  });

  it("flags a marketing message with no opt-out wording", () => {
    const warnings = sampleMessageWarnings({
      ...complete,
      useCases: ["MARKETING_PROMOTION"],
      samples: [{ category: "MARKETING", body: "Riverbend: 20% off cleanings this month!" }],
    });

    assert.ok(warnings.some((w) => /opt-out/i.test(w.warning)));
  });

  it("is a warning rather than a verdict", () => {
    const warnings = sampleMessageWarnings({
      ...complete,
      samples: [{ category: "TRANSACTIONAL", body: "Your appointment is Tuesday." }],
    });

    for (const warning of warnings) {
      assert.doesNotMatch(
        warning.warning,
        /violat|illegal|non-compliant|will be rejected/i,
        "a flag must not read as a ruling",
      );
    }
  });
});

describe("suggested status", () => {
  it("moves an internal profile along as it fills up", () => {
    assert.equal(suggestedStatus(a2pReadiness({}), "INFORMATION_NEEDED"), "INFORMATION_NEEDED");
    assert.equal(suggestedStatus(a2pReadiness(complete), "INFORMATION_NEEDED"), "READY_TO_SUBMIT");
  });

  it("never touches a status a provider owns", () => {
    for (const status of ["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "NEEDS_RESUBMISSION"]) {
      assert.equal(
        suggestedStatus(a2pReadiness(complete), status),
        status,
        `${status} is the provider's answer and must not be inferred from a checklist`,
      );
    }
  });

  it("leaves a client who does not need A2P alone", () => {
    assert.equal(suggestedStatus(a2pReadiness({}), "NOT_REQUIRED"), "NOT_REQUIRED");
  });
});
