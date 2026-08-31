/**
 * Refuses to let a test process start against a database it must not touch.
 *
 * Loaded with --import from the test script, so it runs before any suite is
 * imported and therefore before any fixture cleanup can execute. That ordering
 * is the whole point: these suites open with deleteMany calls, so a runner
 * pointed at the wrong database destroys data before the first assertion.
 *
 * Allowed: the Test database, and Development. Development stays allowed
 * because it is where these tests have always run and where a developer
 * without .env.test will land; it holds nothing irreplaceable.
 *
 * Refused: UAT, staging, production, and anything whose name we do not
 * recognise. Unknown is refused rather than waved through - a database nobody
 * named in ENVIRONMENTS is a database nobody has decided is safe to wipe.
 */
import { classify, resolveTarget } from "../../scripts/db-identity.mjs";

const ALLOWED = new Set(["test", "development"]);

let target;

try {
  target = resolveTarget();
} catch (error) {
  console.error(`\n[tests] Cannot determine the target database.\n${error.message}\n`);
  process.exit(1);
}

const environment = classify(target.name);

if (!ALLOWED.has(environment)) {
  console.error(
    `\n[tests] Refusing to run against "${target.name}" (${environment}).\n`
      + `        Resolved by ${target.decidedBy} at ${target.host}.\n\n`
      + "        These suites create and delete fixtures. Point them at the Test\n"
      + "        database - see .env.example - and run them again.\n",
  );
  process.exit(1);
}

if (environment === "development" && !process.env.TESTS_ON_DEVELOPMENT_OK) {
  console.warn(
    `[tests] Running against Development ("${target.name}"). `
      + "Create .env.test for an isolated Test database.",
  );
}
