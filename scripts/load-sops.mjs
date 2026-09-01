/**
 * Loads the SOP documents in docs/sop into the SOP library.
 *
 * Idempotent and additive: an SOP whose content already matches the newest
 * stored version is skipped, so running this twice does not manufacture a
 * version 1.1 that changed nothing. Nothing is ever deleted or overwritten -
 * a changed document publishes a new immutable version and drops the SOP back
 * to Draft, because the version somebody approved is not the version now in
 * the box.
 *
 * Loaded SOPs start as DRAFT. Activation is a person's decision, made in the
 * app by somebody other than the author.
 *
 *   node scripts/load-sops.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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
    `\n[load-sops] ${target.host} is not a local database, and a changed document`
      + " drops its SOP back to Draft and clears the approval." + "\n"
      + "[load-sops] Re-run with LOAD_SOPS_ALLOW_REMOTE=1 if that is what you mean to do.",
  );
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

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

async function main() {
  const files = readdirSync(sopDir)
    .filter((name) => name.startsWith("SOP-") && name.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.error(`No SOP documents found in ${sopDir}.`);
    process.exit(1);
  }

  // Attribute authorship to the owner seat so the library has a real author
  // rather than a system placeholder, and so the self-approval rule has
  // somebody to check against.
  const author = await prisma.user.findFirst({
    where: { isActive: true, deletedAt: null, teamRole: "AGENCY_OWNER" },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  if (!author) {
    console.error("No active agency owner to record as the author. Seed the team first.");
    process.exit(1);
  }

  let added = 0;
  let updated = 0;
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
          select: { content: true },
        },
      },
    });

    if (!existing) {
      await prisma.sop.create({
        data: {
          reference: parsed.reference,
          title,
          summary: `Loaded from ${file}.`,
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

    if (existing.versions[0]?.content === content) {
      unchanged += 1;
      continue;
    }

    const [major, minor] = existing.currentVersion.split(".");
    const version = /^\d+$/.test(major ?? "") && /^\d+$/.test(minor ?? "")
      ? `${major}.${Number(minor) + 1}`
      : "1.0";

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
          changeNote: `Re-imported from ${file}.`,
          authorId: author.id,
        },
      }),
    ]);

    updated += 1;
    console.log(`  updated  ${parsed.reference}  now version ${version}`);
  }

  console.log(
    `\nSOP library: ${added} added, ${updated} updated, ${unchanged} already current.`,
  );
  console.log("All loaded SOPs are drafts. Somebody other than the author activates them.");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
