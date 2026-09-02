/**
 * The two rules a seed run turns on, kept where they can be tested.
 *
 * `load-sops.mjs` is a script: it resolves a connection, prints, writes and
 * exits, and none of that is reachable from a test without a database and a
 * subprocess. The decisions worth protecting are small and pure, so they live
 * here instead. See tests/sop-seed-rules.test.ts.
 */

/**
 * What to do with one document.
 *
 * The rule that matters is the last line. The app is the source of truth for
 * procedures, so a file that disagrees with the library loses - a procedure
 * somebody edited and had approved is not reverted because a stale copy of it
 * is still sitting in the repository. LOAD_SOPS_REPLACE is the deliberate
 * exception, for restoring an environment rather than for routine use.
 *
 * @param existingContent The newest version in the library, or null if the SOP
 *   is not there at all.
 */
export function decideSeedAction({ existingContent, fileContent, replace }) {
  if (existingContent === null || existingContent === undefined) return "create";
  if (existingContent === fileContent) return "unchanged";

  return replace ? "replace" : "leave-alone";
}

/**
 * The next version number, bumping the minor part.
 *
 * Anything that is not two integers falls back to 1.0 rather than producing
 * "1.NaN" - a version string is on the record an audit reads, and a broken one
 * there is worse than restarting the count.
 */
export function nextSeedVersion(current) {
  const [major, minor] = String(current ?? "").split(".");

  return /^\d+$/.test(major ?? "") && /^\d+$/.test(minor ?? "")
    ? `${major}.${Number(minor) + 1}`
    : "1.0";
}
