import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  parseSopDocument,
  purposeLine,
  referencedSops,
  routeForHeading,
  sectionForSlot,
  sectionsForTab,
  sopNumber,
  tabHasContent,
  type SopTab,
} from "@/lib/governance/sop-document";

const SOP_DIR = join(process.cwd(), "docs", "sop");

function realDocuments() {
  return readdirSync(SOP_DIR)
    .filter((name) => name.startsWith("SOP-") && name.endsWith(".md"))
    .sort()
    .map((name) => ({ name, content: readFileSync(join(SOP_DIR, name), "utf8") }));
}

const CONTENT_TABS: SopTab[] = [
  "overview",
  "procedure",
  "system",
  "quality",
  "roles",
  "resources",
];

describe("reading an SOP document", () => {
  it("takes the title from the document rather than the banner", () => {
    const document = parseSopDocument(
      "# THE EXALTED MEDIA\n# SOP 03 — Payment\n\n## Purpose\nDo the thing.\n",
    );

    assert.equal(document.title, "SOP 03 — Payment");
  });

  it("reads a numbered list as an ordered sequence", () => {
    const document = parseSopDocument("## Main Process\n1. First.\n2. Second.\n");
    const steps = sectionForSlot(document, "steps");

    assert.equal(steps?.ordered, true);
    assert.deepEqual(steps?.items, ["First.", "Second."]);
  });

  it("reads a bulleted list as a set rather than a sequence", () => {
    const document = parseSopDocument("## Outcomes\n- Paid.\n- Onboarded.\n");
    const outcomes = sectionForSlot(document, "outcomes");

    assert.equal(outcomes?.ordered, false);
    assert.deepEqual(outcomes?.items, ["Paid.", "Onboarded."]);
  });

  it("joins a step that wrapped onto the next line", () => {
    /* The documents wrap at 80 columns, so this is the normal case, not an
       edge one: a long step arrives as two lines. */
    const document = parseSopDocument(
      "## Main Process\n1. Confirm the client is an administrator of their own\nplatforms before removing agency access.\n",
    );

    assert.deepEqual(sectionForSlot(document, "steps")?.items, [
      "Confirm the client is an administrator of their own platforms before removing agency access.",
    ]);
  });

  it("keeps a ### rule as a subsection instead of flattening it into prose", () => {
    const document = parseSopDocument(
      "## Completion\nAll done.\n\n### The gate\nNothing ships unapproved.\n",
    );
    const completion = sectionForSlot(document, "completion");

    assert.equal(completion?.subsections.length, 1);
    assert.equal(completion?.subsections[0].heading, "The gate");
    assert.deepEqual(completion?.subsections[0].paragraphs, ["Nothing ships unapproved."]);
  });

  it("matches a heading whatever its punctuation", () => {
    for (const heading of ["Quality & Exit Criteria", "quality and exit criteria", "Exit Criteria"]) {
      assert.equal(routeForHeading(heading).tab, "quality", heading);
    }
  });

  it("puts the agency standard on the overview, not with the steps", () => {
    /* It answers "what will I be held to", not "what do I do", and somebody
       about to follow a procedure needs it before the steps. */
    for (const heading of ["Agency Standard", "Critical Rules", "agency standard"]) {
      assert.deepEqual(
        routeForHeading(heading),
        { tab: "overview", slot: "agencyStandard" },
        heading,
      );
    }
  });

  it("reads the standard's rules out of its ### subsections", () => {
    const document = parseSopDocument(
      "## Agency Standard\nEvery lead has an owner.\n\n### Ownership\nOne accountable rep.\n\n### Follow-Up\nA dated next follow-up.\n",
    );
    const standard = sectionForSlot(document, "agencyStandard");

    assert.deepEqual(standard?.paragraphs, ["Every lead has an owner."]);
    assert.deepEqual(
      standard?.subsections.map((rule) => rule.heading),
      ["Ownership", "Follow-Up"],
    );
  });

  it("routes the typical outcome to the overview for the rail", () => {
    assert.deepEqual(routeForHeading("Typical Outcome"), {
      tab: "overview",
      slot: "typicalOutcome",
    });
  });

  it("sends an unrecognised heading to the procedure rather than dropping it", () => {
    /* The important half. A section nobody anticipated must still reach the
       page: this is an audited document, and silently losing a paragraph of
       it is the worst thing this parser could do. */
    assert.deepEqual(routeForHeading("Archive, not delete"), {
      tab: "procedure",
      slot: "standard",
    });
  });

  it("keeps text that appears before any heading", () => {
    const document = parseSopDocument("Some preamble.\n\n## Purpose\nWhy.\n");

    assert.equal(document.sections[0].paragraphs[0], "Some preamble.");
  });

  it("prefers the document's purpose over the stored summary", () => {
    /* Sop.summary is filled by the seed script with the filename it read, and
       nothing in the interface lets anybody correct it. Trusting it first put
       "Loaded from SOP-03-....md" at the top of the page, where the purpose
       belongs. */
    const document = parseSopDocument("## Purpose\nFrom the document.\n");

    assert.equal(purposeLine(document, "Loaded from SOP-03.md."), "From the document.");
    assert.equal(purposeLine(document, null), "From the document.");
  });

  it("falls back to the stored summary when no purpose is written", () => {
    const document = parseSopDocument("## Main Process\n1. Do it.\n");

    assert.equal(purposeLine(document, "From the record."), "From the record.");
    assert.equal(purposeLine(document, null), null);
  });

  it("finds the procedures a document names, and never itself", () => {
    assert.deepEqual(
      referencedSops("Hand over to SOP 04, then SOP-06. See SOP-03.", "SOP-03"),
      ["SOP-04", "SOP-06"],
    );
  });

  it("reads the number out of a reference", () => {
    assert.equal(sopNumber("SOP-03"), 3);
    assert.equal(sopNumber("SOP-10"), 10);
    assert.equal(sopNumber("housekeeping"), null);
  });

  it("survives a document with no headings at all", () => {
    const document = parseSopDocument("Just some text.");

    assert.equal(document.sections.length, 1);
    assert.equal(tabHasContent(document, "procedure"), true);
  });

  it("has history whether or not the document says anything", () => {
    /* Versions come from the database, so the tab is never empty. */
    assert.equal(tabHasContent(parseSopDocument(""), "history"), true);
  });
});

describe("the ten real procedures", () => {
  it("every section reaches exactly one tab", () => {
    for (const { name, content } of realDocuments()) {
      const document = parseSopDocument(content);

      for (const section of document.sections) {
        const landed = CONTENT_TABS.filter((tab) =>
          sectionsForTab(document, tab).includes(section),
        );

        assert.equal(
          landed.length,
          1,
          `${name}: "${section.heading}" landed on ${landed.length} tabs (${landed.join(", ")})`,
        );
      }
    }
  });

  it("no section is left with nothing in it", () => {
    for (const { name, content } of realDocuments()) {
      for (const section of parseSopDocument(content).sections) {
        assert.ok(
          section.paragraphs.length || section.items.length || section.subsections.length,
          `${name}: "${section.heading}" parsed to nothing`,
        );
      }
    }
  });

  it("each one fills the overview, procedure, quality and roles tabs", () => {
    for (const { name, content } of realDocuments()) {
      const document = parseSopDocument(content);

      for (const tab of ["overview", "procedure", "quality", "roles"] as SopTab[]) {
        assert.ok(tabHasContent(document, tab), `${name}: ${tab} is empty`);
      }
    }
  });

  it("each one has a purpose to show in the header", () => {
    for (const { name, content } of realDocuments()) {
      assert.ok(purposeLine(parseSopDocument(content), null), `${name}: no purpose`);
    }
  });
});
