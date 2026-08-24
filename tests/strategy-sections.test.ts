import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ServiceType } from "@prisma/client";
import {
  ROADMAP_PHASES,
  STRATEGY_SECTIONS,
  type SectionStatus,
  type StrategySectionKey,
  phaseBlockers,
  requiredSectionKeys,
  strategyProgress,
} from "@/lib/strategy/strategy-sections";

/**
 * How much of a client's strategy is done.
 *
 * The property worth protecting is the denominator. A percentage is only
 * honest if it counts the sections this client actually needs - count a paid
 * media strategy against a website-support account and it can never reach
 * full, which is how a progress figure stops being read at all.
 */

const section = (key: StrategySectionKey, status: SectionStatus) => ({ key, status });

describe("required sections", () => {
  it("asks a website-only client for less than a full-service one", () => {
    const website = requiredSectionKeys(["WEBSITE_SUPPORT"]);
    const full = requiredSectionKeys(["FULL_SERVICE_RETAINER"]);

    assert.ok(
      website.length < full.length,
      "a website account should not need every section a retainer does",
    );
  });

  it("does not ask a website client for a channel strategy", () => {
    assert.equal(requiredSectionKeys(["WEBSITE_SUPPORT"]).includes("CHANNEL_STRATEGY"), false);
  });

  it("does ask an advertising client for one", () => {
    assert.equal(requiredSectionKeys(["PAID_ADVERTISING"]).includes("CHANNEL_STRATEGY"), true);
  });

  it("asks everybody for the six that are what strategy means", () => {
    const bare = requiredSectionKeys(["SEO"]);

    for (const key of [
      "BUSINESS_GOALS",
      "TARGET_AUDIENCE",
      "OFFER",
      "VALUE_PROPOSITION",
      "COMPETITIVE_POSITIONING",
      "ACQUISITION_STRATEGY",
      "TRACKING_MEASUREMENT",
      "EXECUTION_ROADMAP",
    ] as StrategySectionKey[]) {
      assert.ok(bare.includes(key), `${key} should apply to every client`);
    }
  });

  it("takes the union when a client bought several services", () => {
    const both = requiredSectionKeys(["PAID_ADVERTISING", "BRAND_STRATEGY"]);

    assert.ok(both.includes("CHANNEL_STRATEGY"));
    assert.ok(both.includes("BRAND_FOUNDATION"));
  });
});

describe("strategy progress", () => {
  const services: ServiceType[] = ["WEBSITE_SUPPORT"];

  it("reads nothing done as zero rather than dividing by nothing", () => {
    const progress = strategyProgress([], services);

    assert.equal(progress.percent, 0);
    assert.equal(progress.completed, 0);
    assert.ok(progress.total > 0);
  });

  it("counts a section awaiting review as completed work", () => {
    const progress = strategyProgress(
      [section("BUSINESS_GOALS", "READY_FOR_REVIEW")],
      services,
    );

    assert.equal(progress.completed, 1);
    assert.equal(progress.awaitingReview, 1);
    assert.equal(progress.approved, 0);
  });

  it("does not count one that is merely in progress", () => {
    assert.equal(
      strategyProgress([section("BUSINESS_GOALS", "IN_PROGRESS")], services).completed,
      0,
    );
  });

  it("ignores a section this client does not need", () => {
    const withExtra = strategyProgress(
      [section("CHANNEL_STRATEGY", "APPROVED")],
      services,
    );

    assert.equal(
      withExtra.completed,
      0,
      "approving a section that does not apply must not move the bar",
    );
  });

  it("reaches a hundred when every required section is done", () => {
    const all = requiredSectionKeys(services).map((key) => section(key, "APPROVED"));
    const progress = strategyProgress(all, services);

    assert.equal(progress.percent, 100);
    assert.equal(progress.completed, progress.total);
    assert.deepEqual(progress.notStarted, []);
  });

  it("names what nobody has started, for the missing list", () => {
    const progress = strategyProgress([section("BUSINESS_GOALS", "APPROVED")], services);

    assert.ok(progress.notStarted.includes("TARGET_AUDIENCE"));
    assert.equal(progress.notStarted.includes("BUSINESS_GOALS"), false);
  });

  it("treats a section with no row as not started", () => {
    const progress = strategyProgress([], services);

    assert.equal(progress.notStarted.length, progress.total);
  });
});

/**
 * What stops a roadmap phase being called complete.
 *
 * Blockers come back as sentences rather than a boolean, because a phase that
 * refuses to advance without saying why is the most annoying kind of refusal.
 */
describe("roadmap blockers", () => {
  const discovery = ROADMAP_PHASES[0];
  const services: ServiceType[] = ["WEBSITE_SUPPORT"];

  it("holds discovery until the intake is in", () => {
    const blockers = phaseBlockers(
      discovery,
      [section("BUSINESS_GOALS", "APPROVED")],
      services,
      false,
    );

    assert.deepEqual(blockers, ["The client has not submitted their intake form"]);
  });

  it("clears once the intake is in and the goals are ready", () => {
    const blockers = phaseBlockers(
      discovery,
      [section("BUSINESS_GOALS", "APPROVED")],
      services,
      true,
    );

    assert.deepEqual(blockers, []);
  });

  it("names the section that is holding it up", () => {
    const blockers = phaseBlockers(discovery, [], services, true);

    assert.equal(blockers.length, 1);
    assert.match(blockers[0], /Business Goals is not ready/);
  });

  it("does not block on a section this client does not need", () => {
    const development = ROADMAP_PHASES[2];
    const ready = requiredSectionKeys(services).map((key) => section(key, "APPROVED"));

    assert.deepEqual(phaseBlockers(development, ready, services, true), []);
  });

  it("gives every phase in the catalogue a label the strip can draw", () => {
    for (const phase of ROADMAP_PHASES) {
      assert.ok(phase.label.length > 0, `${phase.key} has no label`);
    }
    assert.equal(ROADMAP_PHASES.length, 5, "the reference strip draws five phases");
  });
});

describe("section catalogue", () => {
  it("has no duplicate keys", () => {
    const keys = STRATEGY_SECTIONS.map((s) => s.key);

    assert.equal(new Set(keys).size, keys.length);
  });

  it("gives every section something to explain itself with", () => {
    for (const s of STRATEGY_SECTIONS) {
      assert.ok(s.label.length > 0, `${s.key} has no label`);
      assert.ok(s.description.length > 15, `${s.key} has no real description`);
    }
  });
});
