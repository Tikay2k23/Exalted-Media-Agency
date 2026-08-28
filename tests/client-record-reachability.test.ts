import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/*
 * Endpoints exist; screens are what make them reachable.
 *
 * Replacing a tab's layout twice removed the only screen that could reach a
 * route, and nothing failed: the API kept its tests, the services kept theirs,
 * and the button that used to call them was simply gone. Recording a health
 * assessment, raising a complaint and closing a recovery plan were all
 * unreachable for the length of one commit.
 *
 * So this test does not check behaviour. It checks that somewhere in the
 * client components there is still a caller, which is the one thing a unit
 * test of either side cannot see.
 */

const COMPONENTS = path.join(process.cwd(), "components");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) return sources(full);

    return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts") ? [full] : [];
  });
}

const ALL = sources(COMPONENTS)
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

/**
 * Route, and what stops working when nothing calls it.
 *
 * Written as the fragment a caller contains rather than the route path, so a
 * component that only mentions a route in a comment does not satisfy it.
 */
const REACHABLE: [needle: string, capability: string][] = [
  ["/health`", "recording a client health assessment"],
  ["/complaints`", "raising a complaint"],
  ["/complaints/${", "resolving or closing a complaint"],
  ["/recovery-plans`", "writing a recovery plan"],
  /* Journey can start a plan. Only an editor can close one. */
  ["planId:", "closing or revising a recovery plan"],
  ["/reports`", "creating a report"],
  /* Review refuses an unvalidated report, so a form that cannot set this
     produces drafts that can never leave the drawer. */
  ["dataValidated", "confirming the figures, without which no report can be submitted"],
  ['action: "submit"', "submitting a report for review"],
  ["step.action", "approving and sending a report"],
  ['action: "requestChanges"', "sending a report back to its author"],
  ["/optimizations`", "logging and completing an optimization"],
];

describe("client record reachability", () => {
  for (const [needle, capability] of REACHABLE) {
    it(`keeps ${capability} reachable from a component`, () => {
      assert.ok(
        ALL.includes(needle),
        `Nothing in components/ calls ${needle} any more, so ${capability} cannot be done from the application.`,
      );
    });
  }
});
