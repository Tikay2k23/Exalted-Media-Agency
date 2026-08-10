import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { NAVIGATION, visibleNavigation } from "@/lib/navigation";

const ROOT = process.cwd();

/** Where a href would live as a page under the dashboard layout. */
function pageFileFor(href: string) {
  return join(ROOT, "app", "(dashboard)", ...href.split("/").filter(Boolean), "page.tsx");
}

describe("navigation points at pages that exist", () => {
  it("has a real page behind every entry", () => {
    // A menu item pointing at an unbuilt page is a broken link, not a roadmap.
    for (const group of NAVIGATION) {
      for (const item of group.items) {
        assert.ok(
          existsSync(pageFileFor(item.href)),
          `${item.label} points at ${item.href}, which has no page`,
        );
      }
    }
  });

  it("does not list the same page twice", () => {
    const hrefs = NAVIGATION.flatMap((group) => group.items.map((item) => item.href));

    assert.equal(new Set(hrefs).size, hrefs.length);
  });
});

describe("navigation stays short enough to scan", () => {
  it("keeps the menu under ten entries", () => {
    // Eleven entries, five of which read as "where the work is", is what made
    // the old menu unusable. This is a ratchet against drifting back.
    const count = NAVIGATION.reduce((total, group) => total + group.items.length, 0);

    assert.ok(count <= 10, `navigation has grown to ${count} entries`);
  });

  it("has no two entries that read as the same thing", () => {
    // Accounts / Client Journey / Pipeline / My Work / Weekly Work was the
    // problem. Nothing should say "pipeline" or "work" more than once.
    const labels = NAVIGATION.flatMap((group) =>
      group.items.map((item) => item.label.toLowerCase()),
    );

    for (const word of ["pipeline", "work", "client"]) {
      const matches = labels.filter((label) => label.includes(word));

      assert.ok(
        matches.length <= 1,
        `${matches.length} entries mention "${word}": ${matches.join(", ")}`,
      );
    }
  });
});

describe("navigation is filtered by permission, not by role", () => {
  it("shows a specialist only what they can reach", () => {
    const specialist = new Set([
      "dashboard.view.own",
      "clients.view.assigned",
      "journey.view",
      "workItems.view.assigned",
      "governance.view",
    ]);

    const hrefs = visibleNavigation(specialist).flatMap((group) =>
      group.items.map((item) => item.href),
    );

    assert.ok(hrefs.includes("/clients"));
    assert.ok(hrefs.includes("/journey"));
    // No sales permission, so no sales entry.
    assert.ok(!hrefs.includes("/leads"));
  });

  it("always shows the entries that need no permission", () => {
    const hrefs = visibleNavigation(new Set()).flatMap((group) =>
      group.items.map((item) => item.href),
    );

    assert.ok(hrefs.includes("/dashboard"));
    assert.ok(hrefs.includes("/work"));
    assert.ok(hrefs.includes("/settings"));
  });

  it("drops a group entirely when nothing in it is reachable", () => {
    const groups = visibleNavigation(new Set());

    assert.ok(groups.every((group) => group.items.length > 0));
  });
});
