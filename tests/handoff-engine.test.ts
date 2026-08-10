import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  JOURNEY_OWNERSHIP,
  deriveOwnership,
  describeHandoff,
  journeyPosition,
  primaryOwnerRole,
  stageOwner,
} from "@/lib/workflow/handoff-engine";
import {
  SERVICE_BLUEPRINTS,
  rolesForService,
  specialistsForService,
} from "@/lib/workflow/service-blueprints";

const LABELS = {
  AGENCY_OWNER: "Owner",
  SALES_REP: "Sales",
  PROJECT_MANAGER: "Project manager",
  AUTOMATION_SPECIALIST: "Automation",
  CREATIVE_SPECIALIST: "Creative",
  ADS_SPECIALIST: "Ads",
} as const;

describe("service blueprints", () => {
  it("covers every service the system offers", () => {
    // A service with no blueprint would silently produce a client with no
    // specialists, which is the confusion this whole phase exists to remove.
    const services = [
      "SOCIAL_MEDIA_MANAGEMENT",
      "CONTENT_PRODUCTION",
      "PAID_ADVERTISING",
      "BRAND_STRATEGY",
      "WEBSITE_SUPPORT",
      "FUNNEL_BUILD",
      "CRM_AUTOMATION",
      "SEO",
      "EMAIL_MARKETING",
      "FULL_SERVICE_RETAINER",
    ] as const;

    for (const service of services) {
      assert.ok(SERVICE_BLUEPRINTS[service], `${service} has no blueprint`);
    }
  });

  it("always includes sales and the project manager", () => {
    for (const service of Object.keys(SERVICE_BLUEPRINTS) as (keyof typeof SERVICE_BLUEPRINTS)[]) {
      const roles = rolesForService(service);

      assert.ok(roles.includes("SALES_REP"), `${service} skips sales`);
      assert.ok(roles.includes("PROJECT_MANAGER"), `${service} skips the PM`);
    }
  });

  it("gives a CRM-only client just the automation specialist", () => {
    assert.deepEqual(specialistsForService("CRM_AUTOMATION"), ["AUTOMATION_SPECIALIST"]);
  });

  it("gives a website client just the creative specialist", () => {
    assert.deepEqual(specialistsForService("WEBSITE_SUPPORT"), ["CREATIVE_SPECIALIST"]);
  });

  it("gives full service all three", () => {
    assert.equal(specialistsForService("FULL_SERVICE_RETAINER").length, 3);
  });

  it("puts sales before the project manager before the specialists", () => {
    // The order is what the handoff engine walks, so it is the order the work
    // actually happens in.
    const roles = rolesForService("FULL_SERVICE_RETAINER");

    assert.equal(roles[0], "SALES_REP");
    assert.equal(roles[1], "PROJECT_MANAGER");
  });
});

describe("journey ownership", () => {
  it("names an owner for every journey stage", () => {
    for (const entry of JOURNEY_OWNERSHIP) {
      assert.ok(entry.owner, `${entry.stageKey} has no owner`);
    }
  });

  it("knows where each stage sits", () => {
    assert.equal(journeyPosition("payment_received"), 0);
    assert.ok(journeyPosition("in_production")! > journeyPosition("access_collection")!);
    assert.equal(journeyPosition("not_a_stage"), null);
    assert.equal(journeyPosition(null), null);
  });

  it("hands production to the specialists and QA back to the project manager", () => {
    assert.equal(stageOwner("in_production"), "SPECIALISTS");
    assert.equal(stageOwner("internal_quality_assurance"), "PROJECT_MANAGER");
  });

  it("leaves an archived account with nobody holding it", () => {
    // Otherwise a finished client sits on somebody's list forever.
    assert.equal(stageOwner("archived"), "NOBODY");
    assert.deepEqual(deriveOwnership("archived", "CRM_AUTOMATION").current, []);
  });
});

describe("who has it now and who gets it next", () => {
  it("treats an account not on the journey as still in sales", () => {
    const view = deriveOwnership(null, "CRM_AUTOMATION");

    assert.deepEqual(view.current, ["SALES_REP"]);
    assert.deepEqual(view.next, ["PROJECT_MANAGER"]);
  });

  it("expands production to only the specialists that client bought", () => {
    // The whole point of blueprints: a CRM client in production shows the
    // automation specialist and nobody else.
    assert.deepEqual(deriveOwnership("in_production", "CRM_AUTOMATION").current, [
      "AUTOMATION_SPECIALIST",
    ]);

    assert.deepEqual(deriveOwnership("in_production", "WEBSITE_SUPPORT").current, [
      "CREATIVE_SPECIALIST",
    ]);

    assert.equal(deriveOwnership("in_production", "FULL_SERVICE_RETAINER").current.length, 3);
  });

  it("looks ahead to the next stage's owner", () => {
    const view = deriveOwnership("strategy_and_planning", "CRM_AUTOMATION");

    assert.deepEqual(view.current, ["PROJECT_MANAGER"]);
    assert.deepEqual(view.next, ["AUTOMATION_SPECIALIST"]);
    assert.equal(view.nextStageKey, "in_production");
  });

  it("has nobody next at the end of the journey", () => {
    const view = deriveOwnership("archived", "FULL_SERVICE_RETAINER");

    assert.deepEqual(view.next, []);
    assert.equal(view.nextStageKey, null);
  });

  it("falls back to the project manager for a service with no specialists", () => {
    // Brand strategy has a creative specialist, so build the case explicitly:
    // an unmapped service must still leave somebody holding the client.
    const view = deriveOwnership("in_production", "UNMAPPED" as never);

    assert.deepEqual(view.current, ["PROJECT_MANAGER"]);
  });
});

describe("the single name to chase", () => {
  it("is the specialist when only one is working", () => {
    assert.equal(primaryOwnerRole("in_production", "CRM_AUTOMATION"), "AUTOMATION_SPECIALIST");
  });

  it("is the project manager when several are working in parallel", () => {
    // Pointing at three people is the same as pointing at nobody. The person
    // coordinating is the answer to "who do I chase".
    assert.equal(
      primaryOwnerRole("in_production", "FULL_SERVICE_RETAINER"),
      "PROJECT_MANAGER",
    );
  });

  it("is nobody once the account is archived", () => {
    assert.equal(primaryOwnerRole("archived", "CRM_AUTOMATION"), null);
  });
});

describe("the handoff line people read", () => {
  it("reads as one arrow", () => {
    assert.equal(
      describeHandoff("strategy_and_planning", "CRM_AUTOMATION", LABELS),
      "Project manager → Automation",
    );
  });

  it("joins parallel specialists rather than picking one", () => {
    assert.equal(
      describeHandoff("strategy_and_planning", "FULL_SERVICE_RETAINER", LABELS),
      "Project manager → Automation + Creative + Ads",
    );
  });

  it("says so at the end of the journey", () => {
    assert.match(describeHandoff("archived", "CRM_AUTOMATION", LABELS), /end of the journey/);
  });
});
