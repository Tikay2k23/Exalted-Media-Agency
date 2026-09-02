import type { SopDocument, SopSection } from "@/lib/governance/sop-document";
import { sectionForSlot } from "@/lib/governance/sop-document";

/**
 * Reading the procedure as ordered steps.
 *
 * A procedure is still one markdown body on SopVersion.content - that is the
 * text an audit is judged against, and it has to version as a unit. So a step
 * is not a row in a table; it is a `###` heading under the process section with
 * a few labelled lines beneath it:
 *
 *     ### 1. Capture the Lead
 *     Short: Capture
 *     Owner: Sales Representative / Automation
 *
 *     Create or receive the new lead from an approved source.
 *
 *     Inputs:
 *     - Name
 *     - Lead source
 *
 *     Result: A valid lead record exists in Sales.
 *     Rule: No active lead may remain unassigned.
 *
 * Chosen because it still reads as a document. Somebody opening the raw
 * procedure sees a procedure, not a serialisation format, which matters when
 * the raw text is the thing an auditor is entitled to read.
 *
 * Nine of the ten procedures are still a flat numbered list, and they keep
 * working: a step with no fields is just a title, and the tab renders it as one
 * line. Nothing had to be migrated to make the new layout exist.
 */

export interface ProcedureStep {
  /** Position in the procedure, from the document's own numbering. */
  number: number;
  title: string;
  /** A word or two for the step navigator. */
  short: string;
  owner: string | null;
  supporting: string | null;
  /** For a step that only applies in some cases. */
  appliesWhen: string | null;
  /** What the agency does, as written. */
  what: string[];
  /** Information or conditions the step needs. Not form fields. */
  inputs: string[];
  /** How you know the step was done. */
  result: string | null;
  /** A non-negotiable, shown only where the document marks one. */
  rule: string | null;
  evidence: string | null;
  /** True when there is anything behind the collapsed row. */
  hasDetail: boolean;
}

/**
 * The labelled lines a step understands.
 *
 * Matched case-insensitively at the start of a line. Anything unlabelled is
 * what the agency actually does, which is the common case and so needs no
 * label at all.
 */
const FIELD_ALIASES: Record<string, keyof ProcedureStep> = {
  short: "short",
  owner: "owner",
  "primary owner": "owner",
  supporting: "supporting",
  "supporting role": "supporting",
  "applies when": "appliesWhen",
  "applies to": "appliesWhen",
  inputs: "inputs",
  "required inputs": "inputs",
  "required information": "inputs",
  result: "result",
  "expected result": "result",
  rule: "rule",
  "critical rule": "rule",
  evidence: "evidence",
};

const FIELD_LINE = /^([A-Za-z][A-Za-z ]{2,24}):\s*(.*)$/;
const LIST_ITEM = /^\s{0,3}(?:[-*•])\s+(.*)$/;

/** "3. Validate Lead Information" -> { number: 3, title: "Validate Lead Information" } */
function splitHeading(heading: string, fallbackNumber: number) {
  const match = /^\s*(\d{1,3})[.)]\s*(.*)$/.exec(heading);

  return match
    ? { number: Number(match[1]), title: match[2].trim() }
    : { number: fallbackNumber, title: heading.trim() };
}

/**
 * A short label for the navigator.
 *
 * The document can say so with `Short:`. Otherwise the first word of the title,
 * which reads acceptably for an imperative step name - "Capture the Lead"
 * becomes "Capture" - and never invents a word that is not in the title.
 */
function shortLabel(title: string, declared: string | null) {
  if (declared) return declared;

  return title.split(/\s+/)[0]?.replace(/[^\w&/-]/g, "") || title;
}

/** Reads one `###` step's labelled lines. */
function readStep(
  heading: string,
  raw: string[],
  fallbackNumber: number,
): ProcedureStep {
  const { number, title } = splitHeading(heading, fallbackNumber);

  const values: Record<string, string> = {};
  const inputs: string[] = [];
  const what: string[] = [];

  let collecting: "inputs" | null = null;
  /*
   * The field a plain line continues.
   *
   * The documents wrap at 80 columns, so "Rule: An active lead cannot sit in
   * the pipeline without a documented reason and a next follow-up." arrives as
   * two lines. Without this the second line was not part of the rule at all -
   * it became a stray sentence in what-to-do, which is how half a policy ends
   * up displayed as an instruction.
   */
  let continuing: string | null = null;
  let buffer: string[] = [];

  function flush() {
    if (buffer.length) {
      what.push(buffer.join(" ").replace(/\s+/g, " ").trim());
      buffer = [];
    }
  }

  for (const line of raw) {
    if (!line.trim()) {
      flush();
      /*
       * A blank line ends a list and a wrapped field. Without this an
       * unlabelled paragraph after the inputs would be swallowed as another
       * input.
       */
      collecting = null;
      continuing = null;
      continue;
    }

    const item = LIST_ITEM.exec(line);

    if (item && collecting === "inputs") {
      inputs.push(item[1].trim());
      continue;
    }

    const field = FIELD_LINE.exec(line);
    const key = field ? FIELD_ALIASES[field[1].trim().toLowerCase()] : undefined;

    if (field && key) {
      flush();

      if (key === "inputs") {
        collecting = "inputs";

        /* `Inputs: a, b` on one line is allowed as well as a list beneath. */
        if (field[2].trim()) {
          inputs.push(...field[2].split(",").map((part) => part.trim()).filter(Boolean));
          collecting = null;
        }

        continuing = null;
        continue;
      }

      collecting = null;
      values[key] = field[2].trim();
      continuing = key;
      continue;
    }

    /*
     * A bullet that is not under Inputs belongs to the prose - a step may list
     * its options inline. Kept as a sentence rather than dropped.
     */
    if (item) {
      collecting = null;
      continuing = null;
      buffer.push(item[1].trim());
      continue;
    }

    /* A plain line directly under a labelled field finishes that field. */
    if (continuing) {
      values[continuing] = `${values[continuing]} ${line.trim()}`.trim();
      continue;
    }

    collecting = null;
    buffer.push(line.trim());
  }

  flush();

  const owner = values.owner ?? null;
  const supporting = values.supporting ?? null;
  const appliesWhen = values.appliesWhen ?? null;
  const result = values.result ?? null;
  const rule = values.rule ?? null;
  const evidence = values.evidence ?? null;

  return {
    number,
    title,
    short: shortLabel(title, values.short ?? null),
    owner,
    supporting,
    appliesWhen,
    what,
    inputs,
    result,
    rule,
    evidence,
    /*
     * The collapsed row shows the owner, a truncated summary and the result,
     * so anything written at all is worth opening. A step parsed out of a flat
     * numbered list has none of it, and renders without a control that would
     * open nothing.
     */
    hasDetail:
      what.length > 0
      || inputs.length > 0
      || rule !== null
      || evidence !== null
      || supporting !== null
      || appliesWhen !== null,
  };
}

/**
 * The steps of a procedure, however the document happens to write them.
 *
 * `###` subsections first, because that is the form that carries owners,
 * inputs and results. A flat numbered list still produces steps - just titles -
 * so the nine procedures nobody has rewritten yet render in the same layout.
 */
export function parseProcedureSteps(document: SopDocument): ProcedureStep[] {
  const section = sectionForSlot(document, "steps");

  if (!section) return [];

  if (section.subsections.length) {
    return section.subsections.map((sub, index) =>
      readStep(sub.heading, sub.raw, index + 1),
    );
  }

  return section.items.map((item, index) => {
    const { number, title } = splitHeading(item, index + 1);

    return {
      number,
      title,
      short: shortLabel(title, null),
      owner: null,
      supporting: null,
      appliesWhen: null,
      what: [],
      inputs: [],
      result: null,
      rule: null,
      evidence: null,
      hasDetail: false,
    };
  });
}

/** The `## Exceptions and Escalation` entries, if the document has any. */
export function procedureExceptions(document: SopDocument) {
  const section: SopSection | null = sectionForSlot(document, "escalation");

  if (!section) return [];

  if (section.subsections.length) {
    return section.subsections.map((sub) => ({
      title: sub.heading,
      detail: sub.paragraphs.join(" ") || sub.items.join("; "),
    }));
  }

  return section.items.map((item) => ({ title: item, detail: "" }));
}
