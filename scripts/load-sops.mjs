/**
 * Seeds an empty SOP library from the documents in docs/sop.
 *
 * The app is the source of truth for procedures. The library is edited in
 * Governance, where a change publishes a new immutable version and drops the
 * SOP back to Draft for approval - and that record, with its versions,
 * approvals and review dates, is the one an audit is judged against.
 *
 * So this only ever creates. An SOP that already exists is left exactly as it
 * is, whatever the file next to it now says. It used to update them, which
 * made sense while the files were authoritative and became a way to silently
 * revert somebody's edit once they were not.
 *
 * The files remain the starting content for a new environment, and a record of
 * what the procedures said on the day they were written. They are not the live
 * document.
 *
 *   node scripts/load-sops.mjs
 *
 * LOAD_SOPS_REPLACE=1 publishes the files over the library as new versions,
 * for the rare case where the repository really should win - restoring an
 * environment somebody has edited into a corner, say. It drops every SOP it
 * touches back to Draft.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { decideSeedAction, nextSeedVersion } from "./sop-seed-rules.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sopDir = join(here, "..", "docs", "sop");

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

if (!connectionString) {
  console.error("No DATABASE_URL. Nothing to load into.");
  process.exit(1);
}

/*
 * Says where it is writing, and makes a remote target deliberate.
 *
 * This script had no guard at all: it took whatever DATABASE_URL happened to
 * be set and wrote. That is fine while every database is on this machine and
 * dangerous the moment one is not - loading a changed document drops the SOP
 * back to Draft and clears its approval, which on a live workspace means the
 * procedures the agency is working to are suddenly unapproved.
 *
 * Local targets run without ceremony. Anywhere else has to be asked for.
 */
function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      database: parsed.pathname.replace("/", "") || "(default)",
      isLocal: ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.toLowerCase()),
    };
  } catch {
    return { host: "(unparseable)", database: "(unknown)", isLocal: false };
  }
}

const target = describeTarget(connectionString);

console.log(`Loading SOPs into ${target.database} at ${target.host}`);

if (!target.isLocal && process.env.LOAD_SOPS_ALLOW_REMOTE !== "1") {
  console.error(
    `\n[load-sops] ${target.host} is not a local database. Seeding a live library`
      + " writes procedures somebody will be held to." + "\n"
      + "[load-sops] Re-run with LOAD_SOPS_ALLOW_REMOTE=1 if that is what you mean to do.",
  );
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * The document's Purpose, for the summary column.
 *
 * That column is what the detail page falls back to for the line under the
 * title, so a provenance note there reads as the procedure's purpose. The
 * provenance belongs in the change note, which already carries it.
 */
function parsePurpose(content) {
  const match = /^##[ \t]+Purpose[ \t]*$([\s\S]*?)(?=^##[ \t]|$(?![\s\S]))/m.exec(
    content,
  );

  if (!match) return null;

  const paragraph = match[1].trim().split(/\n[ \t]*\n/)[0] ?? "";

  return paragraph.replace(/\s+/g, " ").trim() || null;
}

/** "SOP-04-Strategy-Project-Planning..." -> { reference, title } */
function parseFilename(filename) {
  const match = /^SOP-(\d+)-(.+)\.md$/.exec(filename);

  if (!match) {
    return null;
  }

  return {
    reference: `SOP-${match[1]}`,
    fallbackTitle: match[2].replaceAll("-", " "),
  };
}

/** The document's own title line wins over the filename. */
function parseTitle(content, fallback) {
  for (const line of content.split("\n")) {
    const heading = /^#\s+(.*)$/.exec(line.trim());

    if (heading && !/^THE EXALTED MEDIA$/i.test(heading[1].trim())) {
      return heading[1].replace(/^SOP\s*\d+\s*[—-]\s*/i, "").trim();
    }
  }

  return fallback;
}

/** The earliest active account matching a shape, or null. */
function findAuthor(where) {
  return prisma.user.findFirst({
    where: { isActive: true, deletedAt: null, ...where },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
}

async function main() {
  const files = readdirSync(sopDir)
    .filter((name) => name.startsWith("SOP-") && name.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.error(`No SOP documents found in ${sopDir}.`);
    process.exit(1);
  }

  /*
   * Attribute authorship to a real person rather than a system placeholder, so
   * the library has an author and the self-approval rule has somebody to check
   * against.
   *
   * The owner seat first. Falling back to the owner tier matters for the case
   * this script is now for: a brand new environment, where prisma/seed.ts has
   * created the accounts but left everybody on the schema's default seat. That
   * used to stop the seed dead on exactly the database it was meant to fill.
   */
  const author =
    (await findAuthor({ teamRole: "AGENCY_OWNER" }))
    ?? (await findAuthor({ role: { in: ["OWNER", "ADMIN"] } }));

  if (!author) {
    console.error(
      "No active owner or admin to record as the author. Run prisma/seed.ts first.",
    );
    process.exit(1);
  }

  console.log(`Recording ${author.name} as the author.`);

  let added = 0;
  let updated = 0;
  let blocked = 0;
  let unchanged = 0;

  for (const file of files) {
    const parsed = parseFilename(file);

    if (!parsed) {
      console.warn(`  skipped ${file} (unrecognised name)`);
      continue;
    }

    const content = readFileSync(join(sopDir, file), "utf8").trim();
    const title = parseTitle(content, parsed.fallbackTitle);

    const existing = await prisma.sop.findUnique({
      where: { reference: parsed.reference },
      select: {
        id: true,
        currentVersion: true,
        versions: {
          orderBy: { publishedAt: "desc" },
          take: 1,
          select: { content: true, changeNote: true },
        },
      },
    });

    if (!existing) {
      await prisma.sop.create({
        data: {
          reference: parsed.reference,
          title,
          summary: parsePurpose(content),
          currentVersion: "1.0",
          status: "DRAFT",
          ownerId: author.id,
          versions: {
            create: {
              version: "1.0",
              content,
              changeNote: `Imported from ${file}.`,
              authorId: author.id,
            },
          },
        },
      });

      added += 1;
      console.log(`  added    ${parsed.reference}  ${title}`);
      continue;
    }

    const action = decideSeedAction({
      existingContent: existing.versions[0]?.content ?? null,
      fileContent: content,
      replace: process.env.LOAD_SOPS_REPLACE === "1",
    });

    if (action === "unchanged") {
      unchanged += 1;
      continue;
    }

    if (action === "leave-alone") {
      blocked += 1;
      console.log(
        `  left alone  ${parsed.reference}  the library has a different version`,
      );
      continue;
    }

    const version = nextSeedVersion(existing.currentVersion);

    await prisma.$transaction([
      prisma.sop.update({
        where: { id: existing.id },
        data: {
          title,
          currentVersion: version,
          // A new version has not been approved yet.
          status: "DRAFT",
          approvedById: null,
          approvedAt: null,
        },
      }),
      prisma.sopVersion.create({
        data: {
          sopId: existing.id,
          version,
          content,
          changeNote: `Replaced from ${file}.`,
          authorId: author.id,
        },
      }),
    ]);

    updated += 1;
    console.log(`  replaced  ${parsed.reference}  now version ${version}`);
  }

  if (blocked) {
    console.log(
      `\n[load-sops] ${blocked} document(s) left alone: the library is the source of truth and holds a different version.`
        + `\n[load-sops] Re-run with LOAD_SOPS_REPLACE=1 only if the files should win.`,
    );
  }

  console.log(
    `\nSOP library: ${added} added, ${updated} replaced, ${unchanged} already current, ${blocked} left alone.`,
  );
  console.log("Newly seeded SOPs are drafts. Somebody other than the author activates them.");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
