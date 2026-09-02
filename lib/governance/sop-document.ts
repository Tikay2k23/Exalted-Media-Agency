/**
 * Reading an SOP as a structured document.
 *
 * A procedure is stored as one markdown body on SopVersion.content, and that
 * is deliberately still the source of truth: it is the text an audit is judged
 * against, it versions as a unit, and splitting it across columns would mean a
 * procedure could be half-superseded. So nothing here stores anything. This
 * turns the document the agency wrote into the sections a reader wants, and
 * the detail page arranges those sections into tabs.
 *
 * The consequence worth understanding: what a tab can show is exactly what
 * somebody wrote. A tab with no matching heading says so and names the heading
 * to add, rather than inventing content or hiding the gap.
 */

/** One `##` section of the document. */
export interface SopSection {
  /** The heading as written, e.g. "Main Process". */
  heading: string;
  /** Paragraphs that are not list items. */
  paragraphs: string[];
  /** List items, ordered or bulleted, with their numbering stripped. */
  items: string[];
  /** True when the list was numbered, which makes it a sequence of steps. */
  ordered: boolean;
  /** `###` subsections, kept so a nested rule is not flattened into prose. */
  subsections: { heading: string; paragraphs: string[]; items: string[] }[];
}

export interface SopDocument {
  /** The `# SOP 03 — ...` line, when the document carries one. */
  title: string | null;
  sections: SopSection[];
}

/**
 * The tabs the detail page offers.
 *
 * "standard" is not in the reference design. It exists because the documents
 * carry named rules - the ordering rule in offboarding, the QA rule, how A2P
 * readiness differs from carrier approval - that are neither a step nor an
 * exit criterion, and dropping them on the floor would lose the part of the
 * procedure people actually get wrong.
 */
export type SopTab =
  | "overview"
  | "procedure"
  | "system"
  | "quality"
  | "roles"
  | "resources"
  | "history";

/**
 * Which headings feed which tab.
 *
 * Matched case-insensitively on the heading text with punctuation and
 * ampersands normalised, so "Quality & Exit Criteria", "quality and exit
 * criteria" and "Quality and Exit Criteria" are one heading. Aliases are
 * generous on purpose: the vocabulary should fit what an author would
 * naturally write rather than make them learn a schema.
 */
const HEADING_ROUTES: { tab: SopTab; slot: string; headings: string[] }[] = [
  { tab: "overview", slot: "purpose", headings: ["purpose", "objective"] },
  { tab: "overview", slot: "trigger", headings: ["trigger", "when this starts", "starts when"] },
  { tab: "overview", slot: "scope", headings: ["scope", "applies to"] },
  {
    tab: "overview",
    slot: "outcomes",
    headings: ["outcomes", "expected outcomes", "results"],
  },
  {
    tab: "overview",
    slot: "entry",
    headings: ["entry criteria", "preconditions", "before you start"],
  },

  {
    tab: "procedure",
    slot: "steps",
    headings: ["main process", "procedure", "process", "steps"],
  },

  {
    tab: "system",
    slot: "guide",
    headings: ["system guide", "in the system", "how the system does this"],
  },

  {
    tab: "quality",
    slot: "completion",
    headings: ["completion", "exit criteria", "quality and exit criteria", "definition of done"],
  },
  {
    tab: "quality",
    slot: "checks",
    headings: ["quality checks", "required quality checks", "checks"],
  },
  {
    tab: "quality",
    slot: "blocking",
    headings: ["blocking conditions", "blockers"],
  },
  {
    tab: "quality",
    slot: "evidence",
    headings: ["evidence", "evidence and records", "records", "evidence required"],
  },
  {
    tab: "quality",
    slot: "escalation",
    headings: ["exceptions and escalation", "escalation", "exceptions"],
  },

  {
    tab: "roles",
    slot: "roles",
    headings: [
      "primary owner",
      "strategic owner",
      "operational owner",
      "supporting owner",
      "supporting owners",
      "technical owners",
      "execution owners",
      "qa owners",
      "sales support",
      "roles and responsibilities",
    ],
  },

  {
    tab: "resources",
    slot: "resources",
    headings: ["resources", "how-to guides", "templates", "checklists", "reference documents"],
  },
];

/**
 * Headings normalise before matching so the vocabulary is about words rather
 * than punctuation. "Quality & Exit Criteria:" and "quality and exit criteria"
 * are the same heading.
 */
function normaliseHeading(heading: string) {
  return heading
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ROUTE_BY_HEADING = new Map<string, { tab: SopTab; slot: string }>();

for (const route of HEADING_ROUTES) {
  for (const heading of route.headings) {
    ROUTE_BY_HEADING.set(normaliseHeading(heading), { tab: route.tab, slot: route.slot });
  }
}

/**
 * Where a section belongs.
 *
 * Anything the vocabulary does not recognise is an agency rule and goes with
 * the procedure. That default is the important half: an unrecognised heading
 * must never be a section that silently disappears from the page, because the
 * document is what an audit reads.
 */
export function routeForHeading(heading: string): { tab: SopTab; slot: string } {
  return ROUTE_BY_HEADING.get(normaliseHeading(heading)) ?? { tab: "procedure", slot: "standard" };
}

/** Strips `1.`, `-`, `*` and `•` from the front of a list item. */
const LIST_ITEM = /^\s{0,3}(?:[-*•]|\d{1,3}[.)])\s+(.*)$/;

function isBlank(line: string) {
  return line.trim().length === 0;
}

/**
 * Collects the body of a section into paragraphs and list items.
 *
 * Ordered is decided by the first list item seen: a numbered list is a
 * sequence of steps and gets rendered as one, a bulleted list is a set.
 */
function readBody(lines: string[]) {
  const paragraphs: string[] = [];
  const items: string[] = [];
  let ordered = false;
  let sawItem = false;
  let buffer: string[] = [];

  function flush() {
    if (buffer.length) {
      paragraphs.push(buffer.join(" ").trim());
      buffer = [];
    }
  }

  for (const line of lines) {
    if (isBlank(line)) {
      flush();
      continue;
    }

    const match = LIST_ITEM.exec(line);

    if (match) {
      flush();

      if (!sawItem) {
        ordered = /^\s{0,3}\d/.test(line);
        sawItem = true;
      }

      items.push(match[1].trim());
      continue;
    }

    /*
     * A plain line directly under a list item is that item's continuation -
     * the SOP documents wrap at 80 columns, so a long step arrives as two
     * lines and would otherwise become a stray paragraph beneath the list.
     */
    if (items.length && !buffer.length) {
      items[items.length - 1] = `${items[items.length - 1]} ${line.trim()}`;
      continue;
    }

    buffer.push(line.trim());
  }

  flush();

  return { paragraphs, items, ordered };
}

/**
 * Parses a stored SOP body into its sections.
 *
 * Tolerant by design. A document with no headings at all still produces
 * something readable rather than an empty page: the whole body becomes one
 * unnamed section, which the page shows as the procedure.
 */
export function parseSopDocument(content: string): SopDocument {
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  let title: string | null = null;
  const sections: SopSection[] = [];

  let current: { heading: string; lines: string[] } | null = null;
  let currentSub: { heading: string; lines: string[] } | null = null;
  const subs: { heading: string; lines: string[] }[] = [];

  function closeSection() {
    if (!current) return;

    if (currentSub) {
      subs.push(currentSub);
      currentSub = null;
    }

    const body = readBody(current.lines);

    sections.push({
      heading: current.heading,
      paragraphs: body.paragraphs,
      items: body.items,
      ordered: body.ordered,
      subsections: subs.splice(0).map((sub) => {
        const subBody = readBody(sub.lines);

        return {
          heading: sub.heading,
          paragraphs: subBody.paragraphs,
          items: subBody.items,
        };
      }),
    });

    current = null;
  }

  for (const line of lines) {
    const h1 = /^#\s+(.*)$/.exec(line);
    const h2 = /^##\s+(.*)$/.exec(line);
    const h3 = /^###\s+(.*)$/.exec(line);

    if (h3) {
      if (currentSub) subs.push(currentSub);

      /*
       * A subsection with no section above it would be lost. Opening an
       * unnamed section keeps the text on the page.
       */
      if (!current) current = { heading: "", lines: [] };

      currentSub = { heading: h3[1].trim(), lines: [] };
      continue;
    }

    if (h2) {
      closeSection();
      current = { heading: h2[1].trim(), lines: [] };
      continue;
    }

    if (h1) {
      /*
       * The documents open with a "# THE EXALTED MEDIA" banner and then the
       * real title. The last h1 before any section wins, which picks the
       * title and drops the banner without hard-coding the agency's name.
       */
      if (!current) {
        title = h1[1].trim();
        continue;
      }
    }

    if (currentSub) {
      currentSub.lines.push(line);
      continue;
    }

    if (current) {
      current.lines.push(line);
      continue;
    }

    /* Text before the first heading is the document's own preamble. */
    if (!isBlank(line)) {
      current = { heading: "", lines: [line] };
    }
  }

  closeSection();

  return { title, sections };
}

/** Every section routed to one tab, in the order the document wrote them. */
export function sectionsForTab(document: SopDocument, tab: SopTab) {
  return document.sections.filter((section) => routeForHeading(section.heading).tab === tab);
}

/** The first section filling a named slot, e.g. the purpose. */
export function sectionForSlot(document: SopDocument, slot: string) {
  return (
    document.sections.find((section) => routeForHeading(section.heading).slot === slot) ?? null
  );
}

/**
 * A one-line summary for the header.
 *
 * The document's own Purpose wins. Sop.summary is a convenience column that
 * nothing in the interface lets anybody edit, and the seed script fills it
 * with the filename it read - so trusting it first put "Loaded from
 * SOP-03-Payment-Onboarding-and-Access-Collection.md" at the top of the page
 * where the purpose belongs. The procedure is the source of truth; the column
 * is a fallback for a document that never wrote a Purpose.
 */
export function purposeLine(document: SopDocument, storedSummary: string | null) {
  const purpose = sectionForSlot(document, "purpose");
  const written = purpose?.paragraphs[0] ?? purpose?.items[0];

  return written ?? storedSummary?.trim() ?? null;
}

/**
 * Whether a tab has anything to show.
 *
 * History is always available - the versions come from the database rather
 * than the document, and there is always at least one.
 */
export function tabHasContent(document: SopDocument, tab: SopTab) {
  if (tab === "history") return true;

  return sectionsForTab(document, tab).some(
    (section) =>
      section.paragraphs.length > 0
      || section.items.length > 0
      || section.subsections.length > 0,
  );
}

/** SOP-03 -> 3, for ordering and for finding the neighbouring procedures. */
export function sopNumber(reference: string) {
  const match = /(\d+)\s*$/.exec(reference.trim());

  return match ? Number(match[1]) : null;
}

/**
 * Other procedures this one points at.
 *
 * Read out of the text rather than stored, because there is no relationship
 * model and inventing one to hold what the document already says would be a
 * second source of truth for the same fact. "SOP 06" and "SOP-06" both count.
 */
export function referencedSops(content: string, ownReference: string) {
  const own = normaliseReference(ownReference);
  const found = new Set<string>();

  for (const match of content.matchAll(/SOP[\s-]?(\d{1,2})/gi)) {
    const reference = `SOP-${match[1].padStart(2, "0")}`;

    if (normaliseReference(reference) !== own) {
      found.add(reference);
    }
  }

  return [...found].sort();
}

function normaliseReference(reference: string) {
  const number = sopNumber(reference);

  return number === null ? reference.trim().toUpperCase() : `SOP-${String(number).padStart(2, "0")}`;
}
