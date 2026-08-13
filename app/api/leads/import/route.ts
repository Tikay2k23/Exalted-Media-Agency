import { NextResponse } from "next/server";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { resolveImportContacts } from "@/lib/sales/contact-service";
import {
  classifyRows,
  parseLeadCsv,
  rowsToWrite,
  summariseImport,
  type DuplicateMode,
} from "@/lib/sales/lead-import";
import { SALES_PIPELINE_ID } from "@/lib/workspace-defaults";

export const runtime = "nodejs";

/**
 * Bulk import, in two passes.
 *
 * Preview classifies every row and writes nothing. Commit re-parses the same
 * text and re-checks the database rather than trusting the classification the
 * browser sent back - a preview taken five minutes ago may have gone stale, and
 * a client that decides what is a duplicate is a client that can be persuaded
 * to overwrite a lead.
 */
const bodySchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  mode: z.enum(["preview", "commit"]),
  onDuplicate: z.enum(["skip", "update"]).default("skip"),
  assignToId: z.string().nullish(),
});

/** More than this in one file is a data migration, not an import. */
const MAX_ROWS = 2000;

export async function POST(request: Request) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await loadAuthContext(session.user.id);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can(actor, "leads.create")) {
    return NextResponse.json(
      { error: "You do not have permission to import leads." },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid import request" }, { status: 400 });
  }

  const { csv, mode, onDuplicate, assignToId } = parsed.data;
  const result = parseLeadCsv(csv);

  if (result.missingColumns.length > 0) {
    return NextResponse.json(
      {
        error: `The file needs a ${result.missingColumns.join(" and a ")} column.`,
        missingColumns: result.missingColumns,
      },
      { status: 400 },
    );
  }

  if (result.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `That file has ${result.rows.length} rows. Import ${MAX_ROWS} at a time.` },
      { status: 400 },
    );
  }

  /*
   * Matched against every lead, not only the ones this person can see. A rep
   * who cannot see somebody else's lead must still not be able to create a
   * second copy of it - and the id never leaves the server unless the row is
   * theirs to update.
   */
  const emails = [...new Set(result.rows.map((row) => row.email).filter(Boolean))] as string[];

  const existing = emails.length
    ? await prisma.lead.findMany({
        where: { email: { in: emails, mode: "insensitive" }, deletedAt: null },
        select: { id: true, email: true, assignedToId: true },
      })
    : [];

  const existingByEmail = new Map(
    existing
      .filter((lead) => lead.email)
      .map((lead) => [lead.email!.toLowerCase(), lead.id] as const),
  );

  const classified = classifyRows(result.rows, existingByEmail);
  const summary = summariseImport(classified, result.invalid);

  if (mode === "preview") {
    return NextResponse.json({
      ok: true,
      summary,
      invalid: result.invalid,
      // Enough to show the table, without the whole file coming back.
      rows: classified.slice(0, 200).map((entry) => ({
        line: entry.row.line,
        contactName: entry.row.contactName,
        businessName: entry.row.businessName,
        email: entry.row.email,
        verdict: entry.verdict,
        detail: entry.detail,
      })),
      truncated: classified.length > 200,
    });
  }

  const plan = rowsToWrite(classified, onDuplicate as DuplicateMode);

  const entryStage = await prisma.pipelineStage.findFirst({
    where: { pipelineId: SALES_PIPELINE_ID, stageKey: "new_website_lead" },
    select: { id: true },
  });

  // Assigning to somebody who does not exist would silently orphan every row.
  const owner = assignToId
    ? await prisma.user.findFirst({
        where: { id: assignToId, isActive: true, deletedAt: null },
        select: { id: true },
      })
    : null;

  if (assignToId && !owner) {
    return NextResponse.json({ error: "That owner could not be found." }, { status: 404 });
  }

  /*
   * Every imported row lands on a contact, and a row whose email or phone
   * already belongs to somebody becomes another opportunity against them rather
   * than a second copy of the person. Resolved as a batch, so a large file is
   * still two queries rather than two per line.
   */
  const contactIds = plan.create.length
    ? await resolveImportContacts(
        actor.id,
        owner?.id ?? null,
        plan.create.map((row) => ({
          contactName: row.contactName,
          businessName: row.businessName,
          email: row.email,
          phone: row.phone,
        })),
      )
    : new Map<number, string>();

  const created = plan.create.length
    ? await prisma.lead.createMany({
        data: plan.create.map((row, index) => ({
          contactId: contactIds.get(index) ?? null,
          contactName: row.contactName,
          businessName: row.businessName,
          email: row.email,
          phone: row.phone,
          opportunityName: row.businessName,
          source: (row.source ?? "OTHER") as never,
          budgetAmount: row.budgetAmount,
          notes: row.notes,
          assignedToId: owner?.id ?? null,
          createdById: actor.id,
          stageId: entryStage?.id ?? null,
          status: "NEW" as const,
        })),
      })
    : { count: 0 };

  /*
   * Updates fill gaps rather than replacing what is there. Somebody importing a
   * fresh export should not blank a phone number a salesperson typed in last
   * week because the spreadsheet column was empty.
   */
  let updated = 0;

  for (const entry of plan.update) {
    const current = await prisma.lead.findUnique({
      where: { id: entry.id },
      select: { phone: true, notes: true, budgetAmount: true },
    });

    if (!current) continue;

    await prisma.lead.update({
      where: { id: entry.id },
      data: {
        contactName: entry.row.contactName,
        businessName: entry.row.businessName,
        phone: entry.row.phone ?? current.phone,
        notes: entry.row.notes ?? current.notes,
        budgetAmount: entry.row.budgetAmount ?? current.budgetAmount,
        ...(owner ? { assignedToId: owner.id } : {}),
      },
    });

    updated += 1;
  }

  await logActivity({
    actorId: actor.id,
    action: `Imported ${created.count} lead${created.count === 1 ? "" : "s"}${
      updated ? ` and updated ${updated}` : ""
    }`,
    entityType: "LEAD",
    entityId: actor.id,
    metadataJson: {
      created: created.count,
      updated,
      skipped: summary.duplicates - updated,
      duplicatesInFile: summary.duplicatesInFile,
      invalid: summary.invalid,
      onDuplicate,
    },
  });

  return NextResponse.json({
    ok: true,
    created: created.count,
    updated,
    skipped: summary.duplicates - updated,
    duplicatesInFile: summary.duplicatesInFile,
    invalid: summary.invalid,
  });
}
