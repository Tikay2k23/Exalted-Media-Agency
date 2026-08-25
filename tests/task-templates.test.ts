import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SERVICE_TASK_TEMPLATES,
  STAGE_TASK_TEMPLATES,
  getServiceTaskTemplates,
  getStageTaskTemplates,
  templateKeyFor,
} from "@/lib/automation/stage-automation";

/**
 * Service work templates.
 *
 * Stage templates cover the process every client goes through. They cannot
 * cover what is being built, because that depends on what was bought - and
 * generating a website client's service pages beside a CRM client's workflows
 * would bury each of them in the other's work.
 */
describe("service task templates", () => {
  it("has work for the services the agency actually sells", () => {
    for (const service of ["WEBSITE_SUPPORT", "CRM_AUTOMATION", "PAID_ADVERTISING", "SEO"] as const) {
      assert.ok(
        (getServiceTaskTemplates(service) ?? []).length > 0,
        `${service} should have build work`,
      );
    }
  });

  it("asks for nothing when the service has no list, rather than failing", () => {
    assert.deepEqual(getServiceTaskTemplates(null), []);
    assert.deepEqual(getServiceTaskTemplates("BRAND_STRATEGY"), []);
  });

  it("keeps each service's work to that service", () => {
    const website = getServiceTaskTemplates("WEBSITE_SUPPORT").map((task) => task.title);
    const crm = getServiceTaskTemplates("CRM_AUTOMATION").map((task) => task.title);

    assert.equal(website.some((title) => /pipeline|workflow/i.test(title)), false);
    assert.equal(crm.some((title) => /homepage|service pages/i.test(title)), false);
  });

  it("routes every task at a seat that exists", () => {
    // There is no SEO seat in TeamRole, so SEO work goes to the ads and
    // reporting specialist rather than a role nobody holds.
    const seats = [
      "ACCOUNT_OWNER",
      "PROJECT_MANAGER",
      "AUTOMATION_SPECIALIST",
      "CREATIVE_SPECIALIST",
      "ADS_SPECIALIST",
      "ACTOR",
    ];

    for (const [service, templates] of Object.entries(SERVICE_TASK_TEMPLATES)) {
      for (const template of templates ?? []) {
        assert.ok(
          seats.includes(template.assignTo),
          `${service} / ${template.title} routes at ${template.assignTo}, which is not a seat`,
        );
      }
    }
  });

  it("gives every task a due date and an estimate somebody can plan around", () => {
    for (const templates of Object.values(SERVICE_TASK_TEMPLATES)) {
      for (const template of templates ?? []) {
        assert.ok(template.dueInDays > 0, `${template.title} is due on the day it is created`);
        assert.ok(template.estimatedHours > 0, `${template.title} is estimated at nothing`);
        assert.ok(template.note.length > 10, `${template.title} says nothing about itself`);
      }
    }
  });
});

/**
 * Idempotency.
 *
 * A client sent back for revisions and moved forward again runs stage
 * automation a second time. Without a stable key per template, they collect a
 * duplicate of every task the stage creates, and the duplicate looks exactly
 * like real work.
 */
describe("template keys", () => {
  it("gives the same template the same key every time", () => {
    assert.equal(
      templateKeyFor("in_production", "Build the sales pipeline"),
      templateKeyFor("in_production", "Build the sales pipeline"),
    );
  });

  it("separates the same title raised by different sources", () => {
    assert.notEqual(
      templateKeyFor("in_production", "Verify lead tracking end to end"),
      templateKeyFor("service:CRM_AUTOMATION", "Verify lead tracking end to end"),
    );
  });

  it("ignores casing and trailing punctuation", () => {
    assert.equal(
      templateKeyFor("s", "Build The Homepage!"),
      templateKeyFor("s", "build the homepage"),
    );
  });

  it("treats a reworded template as different work, which it is", () => {
    // Deliberate. Renaming a template does not quietly adopt the task made by
    // the old one, because the wording is what somebody was asked to do.
    assert.notEqual(
      templateKeyFor("s", "Add page titles and descriptions"),
      templateKeyFor("s", "Add page titles & meta descriptions"),
    );
  });

  it("produces a key with no spaces, so it reads in a log", () => {
    const key = templateKeyFor("in_production", "Build the follow-up workflows");

    assert.doesNotMatch(key, /\s/);
    assert.match(key, /^in_production:/);
  });

  it("never collides across the templates that actually exist", () => {
    const keys = new Set<string>();
    const collisions: string[] = [];

    const add = (source: string, title: string) => {
      const key = templateKeyFor(source, title);

      if (keys.has(key)) collisions.push(key);
      keys.add(key);
    };

    for (const [stage, templates] of Object.entries(STAGE_TASK_TEMPLATES)) {
      for (const template of templates) add(stage, template.title);
    }

    for (const [service, templates] of Object.entries(SERVICE_TASK_TEMPLATES)) {
      for (const template of templates ?? []) add(`service:${service}`, template.title);
    }

    assert.deepEqual(collisions, [], "two templates would fight over one key");
  });
});
