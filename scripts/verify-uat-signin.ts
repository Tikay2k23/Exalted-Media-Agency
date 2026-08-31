/**
 * Proves each UAT seat can actually sign in.
 *
 * Existence of a User row is not the same thing. A row can carry a hash nobody
 * knows, or be inactive, or be reachable only on a database the app is not
 * pointed at - and every one of those looks fine in a count.
 *
 * Run with the environment file for the database you mean to check:
 *
 *   npx tsx --env-file=.env.uat scripts/verify-uat-signin.ts
 *
 * The refusals at the end are not decoration. Without them a harness that
 * silently accepts everything, or one calling the wrong function, reports six
 * healthy seats either way.
 */

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/*
 * The real credentials provider.
 *
 * Taken from provider.options, not from the provider itself: NextAuth v4 puts
 * a `() => null` stub on the top-level `authorize` and keeps the configured
 * function on `options`. Calling the stub refuses every correct password,
 * which looks exactly like six broken accounts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const provider = authOptions.providers[0] as any;
const authorize = provider.options.authorize as (
  c: Record<string, string>,
  r: unknown,
) => Promise<unknown>;

const req = { headers: new Headers({ host: "localhost:3100" }) };
const signIn = (email: string, password: string) =>
  authorize({ email, password }, req);

const SEATS = [
  ["owner", "Agency Owner"],
  ["sales", "Sales Representative"],
  ["pm", "Project Manager"],
  ["automation", "Automation Specialist"],
  ["creative", "Creative Specialist"],
  ["ads", "Ads and Reporting Specialist"],
];

async function main() {
  const password = process.env.TEAM_SEED_PASSWORD ?? "";
  if (!password) throw new Error("TEAM_SEED_PASSWORD is not set");

  console.log(`database: ${(process.env.DATABASE_URL ?? "").replace(/:\/\/[^@]*@/, "://***@")}\n`);
  console.log("--- sign-in, real authorize() ---");

  let pass = 0;
  for (const [local, label] of SEATS) {
    const email = `${local}@theexaltedmedia.com`;
    const result = (await signIn(email, password)) as { id?: string } | null;
    const row = await prisma.user.findUnique({
      where: { email },
      select: { role: true, teamRole: true, isActive: true },
    });
    const ok = Boolean(result?.id);
    if (ok) pass += 1;
    console.log(
      `  ${ok ? "SIGNED IN" : "REFUSED  "}  ${label.padEnd(30)} ${email.padEnd(32)} `
        + `${String(row?.teamRole).padEnd(24)} ${row?.role}`,
    );
  }
  console.log(`\n  ${pass}/${SEATS.length} seats authenticated`);

  console.log("\n--- falsification (these must all be refused) ---");
  const negatives: [string, unknown][] = [
    ["wrong password", await signIn("owner@theexaltedmedia.com", `${password}x`)],
    ["unknown address", await signIn("nobody@theexaltedmedia.com", password)],
    ["empty password", await signIn("owner@theexaltedmedia.com", "")],
  ];
  for (const [label, result] of negatives) {
    console.log(`  ${result === null ? "refused" : "ACCEPTED <-- BROKEN"}   ${label}`);
  }
}

main().finally(() => prisma.$disconnect());
