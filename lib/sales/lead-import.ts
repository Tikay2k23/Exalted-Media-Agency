/**
 * Reading a spreadsheet of leads.
 *
 * Pure: parsing, mapping and classification all happen without touching the
 * database, so the browser can show an accurate preview before anything is
 * written and the tests can cover the awkward files without a fixture.
 *
 * The one rule this exists to protect: nothing is silently overwritten. Every
 * row is classified before import, the person doing it sees the counts, and
 * duplicates only change an existing lead if they explicitly choose that.
 */

/** One row as the importer understands it. */
export interface ParsedLead {
  /** 1-based, counting the header, so a message can name the line in the file. */
  line: number;
  contactName: string;
  businessName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  budgetAmount: number | null;
  notes: string | null;
}

export type RowVerdict = "new" | "duplicate" | "duplicate-in-file" | "invalid";

export interface ClassifiedRow {
  row: ParsedLead;
  verdict: RowVerdict;
  /** Why it was rejected, or which lead it collides with. */
  detail: string | null;
  /** Set on a duplicate, so the commit step can update rather than search again. */
  existingLeadId?: string;
}

/**
 * Splits CSV text into rows of fields.
 *
 * Written out rather than pulled from a dependency because the awkward parts
 * are few and worth owning: a quoted field may contain commas, newlines, and
 * doubled quotes, and a naive split on comma corrupts exactly the rows people
 * care about - company names with commas in them.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  // A byte order mark at the start of the file would otherwise become part of
  // the first header, and "﻿email" matches nothing.
  const source = text.replace(/^﻿/, "");

  while (index < source.length) {
    const char = source[index];

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }

      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      index += 1;
      continue;
    }

    if (char === "\r") {
      index += 1;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // Whatever is left when the text runs out is the last field of the last row,
  // unless the file ended on a newline and there is nothing pending.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((line) => line.some((cell) => cell.trim().length > 0));
}

/**
 * Which column is which.
 *
 * People export from GoHighLevel, Sheets and half a dozen ad platforms, and
 * none of them agree on a header. Matching on a set of aliases costs nothing
 * and saves the person importing from renaming columns by hand.
 */
const COLUMN_ALIASES: Record<keyof Omit<ParsedLead, "line">, string[]> = {
  contactName: ["contact name", "name", "full name", "contact", "first name", "lead name"],
  businessName: ["business name", "company", "company name", "business", "organisation", "organization", "account"],
  email: ["email", "e-mail", "email address", "contact email"],
  phone: ["phone", "phone number", "mobile", "telephone", "contact phone", "cell"],
  source: ["source", "lead source", "utm source", "channel"],
  budgetAmount: ["budget", "budget amount", "value", "estimated value", "deal value"],
  notes: ["notes", "note", "message", "comments", "enquiry", "inquiry"],
};

function normaliseHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function mapHeaders(header: string[]): Partial<Record<keyof Omit<ParsedLead, "line">, number>> {
  const mapped: Partial<Record<keyof Omit<ParsedLead, "line">, number>> = {};
  const cleaned = header.map(normaliseHeader);

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    /*
     * The aliases go through the same normalisation as the header, or they
     * never match the ones written with punctuation - "E-Mail" becomes
     * "e mail" on one side and stays "e-mail" on the other, and that is one of
     * the most common headers there is.
     */
    const normalised = aliases.map(normaliseHeader);
    const index = cleaned.findIndex((name) => normalised.includes(name));

    if (index >= 0) mapped[field as keyof Omit<ParsedLead, "line">] = index;
  }

  return mapped;
}

/** Loose enough to accept real addresses, strict enough to reject a name. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

/** Source values the Lead model accepts, matched loosely against the column. */
const SOURCE_ALIASES: Record<string, string> = {
  website: "WEBSITE_FORM",
  "website form": "WEBSITE_FORM",
  web: "WEBSITE_FORM",
  form: "WEBSITE_FORM",
  "paid ads": "PAID_ADS",
  ads: "PAID_ADS",
  meta: "PAID_ADS",
  "meta ads": "PAID_ADS",
  facebook: "PAID_ADS",
  google: "PAID_ADS",
  "google ads": "PAID_ADS",
  organic: "ORGANIC_SEARCH",
  seo: "ORGANIC_SEARCH",
  "organic search": "ORGANIC_SEARCH",
  social: "SOCIAL_MEDIA",
  "social media": "SOCIAL_MEDIA",
  instagram: "SOCIAL_MEDIA",
  referral: "REFERRAL",
  referred: "REFERRAL",
  outbound: "OUTBOUND",
  "cold outreach": "OUTBOUND",
  cold: "OUTBOUND",
  partner: "PARTNER",
  event: "EVENT",
  "repeat client": "REPEAT_CLIENT",
  repeat: "REPEAT_CLIENT",
};

export function normaliseSource(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) return null;

  const upper = trimmed.toUpperCase().replace(/[\s-]+/g, "_");

  // An exact enum value passes straight through, so a file exported from this
  // system re-imports unchanged.
  if (Object.values(SOURCE_ALIASES).includes(upper)) return upper;

  return SOURCE_ALIASES[trimmed.toLowerCase()] ?? "OTHER";
}

function parseMoney(value: string | null | undefined): number | null {
  if (!value) return null;

  // Strips currency symbols, thousands separators and stray spaces.
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const amount = Number(cleaned);

  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export interface ParseResult {
  rows: ParsedLead[];
  /** Rows that could not be read at all, with the reason. */
  invalid: { line: number; reason: string }[];
  /** Columns the file did not have, for the message shown before importing. */
  missingColumns: string[];
}

/**
 * Turning the file into rows.
 *
 * A row needs a contact name and a business name, because the Lead record
 * requires both. Everything else is optional - a lead with only a name and a
 * company is still a lead worth chasing, and rejecting it would push people
 * back to typing them in by hand.
 */
export function parseLeadCsv(text: string): ParseResult {
  const table = parseCsv(text);

  if (table.length === 0) {
    return { rows: [], invalid: [], missingColumns: ["contact name", "business name"] };
  }

  const [header, ...body] = table;
  const columns = mapHeaders(header);

  const missingColumns: string[] = [];
  if (columns.contactName === undefined) missingColumns.push("contact name");
  if (columns.businessName === undefined) missingColumns.push("business name");

  if (missingColumns.length > 0) {
    return { rows: [], invalid: [], missingColumns };
  }

  const rows: ParsedLead[] = [];
  const invalid: { line: number; reason: string }[] = [];

  body.forEach((cells, index) => {
    // Plus two: one for the header, one because people count from 1.
    const line = index + 2;
    const read = (key: keyof Omit<ParsedLead, "line">) => {
      const at = columns[key];
      return at === undefined ? null : (cells[at]?.trim() ?? null);
    };

    const contactName = read("contactName") ?? "";
    const businessName = read("businessName") ?? "";

    if (!contactName && !businessName) {
      invalid.push({ line, reason: "No name and no company." });
      return;
    }

    if (!contactName) {
      invalid.push({ line, reason: "No contact name." });
      return;
    }

    if (!businessName) {
      invalid.push({ line, reason: "No company name." });
      return;
    }

    const rawEmail = read("email");
    const email = normaliseEmail(rawEmail);

    // An address that is present but malformed is worth saying so about,
    // rather than importing the lead with the email silently dropped.
    if (rawEmail && !email) {
      invalid.push({ line, reason: `"${rawEmail}" is not an email address.` });
      return;
    }

    rows.push({
      line,
      contactName,
      businessName,
      email,
      phone: read("phone") || null,
      source: normaliseSource(read("source")),
      budgetAmount: parseMoney(read("budgetAmount")),
      notes: read("notes") || null,
    });
  });

  return { rows, invalid, missingColumns: [] };
}

/**
 * Deciding what happens to each row.
 *
 * Two kinds of duplicate, and they are different problems. One is a lead the
 * agency already has, which is a decision - skip it or update it. The other is
 * the same address twice inside one file, which is a mistake in the file: the
 * first occurrence is imported and the rest are reported, because importing
 * both would create the duplicate this whole step exists to prevent.
 *
 * A row with no email cannot be matched, so it is always new. Said plainly
 * rather than guessed at from the name, because two people called John Smith at
 * two plumbing firms are two leads.
 */
export function classifyRows(
  rows: ParsedLead[],
  existingByEmail: Map<string, string>,
): ClassifiedRow[] {
  const seenInFile = new Map<string, number>();

  return rows.map((row) => {
    if (!row.email) {
      return {
        row,
        verdict: "new" as const,
        detail: "No email, so it could not be matched against existing leads.",
      };
    }

    const firstAt = seenInFile.get(row.email);

    if (firstAt !== undefined) {
      return {
        row,
        verdict: "duplicate-in-file" as const,
        detail: `Same email as line ${firstAt} of this file.`,
      };
    }

    seenInFile.set(row.email, row.line);

    const existingLeadId = existingByEmail.get(row.email);

    if (existingLeadId) {
      return {
        row,
        verdict: "duplicate" as const,
        detail: "A lead with this email already exists.",
        existingLeadId,
      };
    }

    return { row, verdict: "new" as const, detail: null };
  });
}

export interface ImportSummary {
  total: number;
  new: number;
  duplicates: number;
  duplicatesInFile: number;
  invalid: number;
}

export function summariseImport(
  classified: ClassifiedRow[],
  invalid: { line: number; reason: string }[],
): ImportSummary {
  const count = (verdict: RowVerdict) =>
    classified.filter((entry) => entry.verdict === verdict).length;

  return {
    total: classified.length + invalid.length,
    new: count("new"),
    duplicates: count("duplicate"),
    duplicatesInFile: count("duplicate-in-file"),
    invalid: invalid.length,
  };
}

/** What to do with rows that match a lead the agency already has. */
export type DuplicateMode = "skip" | "update";

/** The rows that will actually be written, given the chosen handling. */
export function rowsToWrite(classified: ClassifiedRow[], mode: DuplicateMode) {
  return {
    create: classified.filter((entry) => entry.verdict === "new").map((entry) => entry.row),
    update:
      mode === "update"
        ? classified
            .filter((entry) => entry.verdict === "duplicate" && entry.existingLeadId)
            .map((entry) => ({ id: entry.existingLeadId as string, row: entry.row }))
        : [],
  };
}
