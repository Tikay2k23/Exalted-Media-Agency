import "dotenv/config";

import { prisma } from "@/lib/prisma";

/**
 * Which release each case gates.
 *
 * Everything defaults to beta-required, so this file only names the exceptions
 * and says why. Two rules were applied:
 *
 * Nothing that protects data, isolation, permissions or money leaves beta
 * scope, whatever else is true about it. Those are the reasons a small beta
 * with real client data is safe at all.
 *
 * Out of scope means the product deliberately does not have the capability
 * yet - not that the capability is broken. A broken core function stays
 * beta-required and shows as a failure, which is the honest picture.
 */

interface Rule {
  name: string;
  scope: "PRODUCTION_REQUIRED" | "FUTURE_OUT_OF_SCOPE";
  reason: string;
}

const RULES: Rule[] = [
  {
    name: "Connect starts a real authentication flow",
    scope: "FUTURE_OUT_OF_SCOPE",
    reason:
      "No external provider is part of Limited Beta. The beta runs on data entered in the "
      + "application; nothing in the lifecycle depends on a provider connection, and the page "
      + "states plainly that none is configured rather than showing a Connect button that does "
      + "nothing. Becomes production-required the moment a beta client needs a real sync.",
  },
  {
    name: "A sent report keeps its numbers when the data moves on",
    scope: "PRODUCTION_REQUIRED",
    reason:
      "Reports in the beta carry written analysis, dates and recommendations, which are already "
      + "immutable once sent. There is no metrics store, so there are no performance figures in a "
      + "report to drift. This becomes required the moment metrics are recorded against reports.",
  },
  {
    name: "One event does not produce three notifications",
    scope: "PRODUCTION_REQUIRED",
    reason:
      "Notification volume is an irritation at beta scale - a handful of internal users on a few "
      + "accounts - and a correctness problem at production scale. Nothing is lost by observing it "
      + "during the beta rather than gating on it.",
  },
  {
    name: "Dialogs can be operated from the keyboard",
    scope: "PRODUCTION_REQUIRED",
    reason:
      "Accessibility is a genuine requirement and is not being dropped. It needs a person on a "
      + "keyboard and a screen reader to assess honestly, which is a production-readiness activity "
      + "rather than something to guess at now.",
  },
];

async function main() {
  let changed = 0;

  for (const rule of RULES) {
    const result = await prisma.uatTestCase.updateMany({
      where: { name: rule.name },
      data: { releaseScope: rule.scope, scopeReason: rule.reason },
    });

    if (result.count === 0) {
      console.error(`  no such case: ${rule.name}`);
      continue;
    }

    changed += result.count;
  }

  const counts = await prisma.uatTestCase.groupBy({
    by: ["releaseScope"],
    _count: { releaseScope: true },
  });

  console.log(`Classified ${changed} case(s) out of the beta gate.\n`);

  for (const row of counts) {
    console.log(`  ${String(row._count.releaseScope).padStart(3)} ${row.releaseScope}`);
  }

  /* The safeguard: nothing P0 may sit outside the beta gate. */
  const escaped = await prisma.uatTestCase.count({
    where: { severity: "P0", releaseScope: { not: "LIMITED_BETA_REQUIRED" } },
  });

  console.log(
    `\n  P0 cases outside the beta gate: ${escaped}`,
    escaped === 0 ? "(none, as required)" : "<-- these still gate the release regardless",
  );
}

main().finally(() => prisma.$disconnect());
