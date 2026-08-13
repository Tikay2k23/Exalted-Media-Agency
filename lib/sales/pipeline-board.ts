import { dealValue, type SalesLead } from "./sales-view";

/**
 * The opportunity board.
 *
 * Seven columns over thirteen stages. The pipeline the agency actually runs is
 * finer-grained than a board can usefully show - "attempting contact" and
 * "contacted" are two real states but one column - so each column owns a set of
 * stages and knows which one to write when a card is dropped on it.
 *
 * Nothing here queries. The columns, their totals and each card's stage tag are
 * all derived from the rows the page already loaded, so the board and the table
 * beneath it can never disagree about where a lead is.
 */

export type ColumnKey =
  | "new-lead"
  | "contacted"
  | "strategy-call"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won";

export interface BoardColumn {
  key: ColumnKey;
  label: string;
  /** Every stage that shows in this column. */
  stageKeys: string[];
  /**
   * The stage a card takes when dropped here.
   *
   * The earliest of the set, because dropping onto "Strategy Call" means the
   * call is booked, not that it has already happened - the board must not
   * credit somebody with a meeting that has not occurred.
   */
  dropStageKey: string;
}

export const BOARD_COLUMNS: BoardColumn[] = [
  {
    key: "new-lead",
    label: "New Lead",
    stageKeys: ["new_website_lead", "application_submitted"],
    dropStageKey: "new_website_lead",
  },
  {
    key: "contacted",
    label: "Contacted",
    stageKeys: ["attempting_contact", "contacted"],
    dropStageKey: "contacted",
  },
  {
    key: "strategy-call",
    label: "Strategy Call",
    stageKeys: ["strategy_call_booked", "strategy_call_showed"],
    dropStageKey: "strategy_call_booked",
  },
  { key: "qualified", label: "Qualified", stageKeys: ["qualified"], dropStageKey: "qualified" },
  {
    key: "proposal",
    label: "Proposal",
    stageKeys: ["proposal_sent"],
    dropStageKey: "proposal_sent",
  },
  {
    key: "negotiation",
    label: "Negotiation",
    stageKeys: ["negotiation"],
    dropStageKey: "negotiation",
  },
  { key: "won", label: "Won", stageKeys: ["won"], dropStageKey: "won" },
];

/**
 * Stages the board does not show.
 *
 * Lost, nurture and abandoned are real outcomes and their records are
 * untouched - they are simply not columns, because a board whose last three
 * columns fill up with dead deals stops being a picture of live work. They stay
 * reachable from the lead's own menu and the stage filter.
 */
export const OFF_BOARD_STAGE_KEYS = ["long_term_nurture", "lost", "abandoned"];

const COLUMN_BY_STAGE = new Map<string, ColumnKey>(
  BOARD_COLUMNS.flatMap((column) => column.stageKeys.map((key) => [key, column.key] as const)),
);

/** Which column a lead belongs in, or null when it is off the board. */
export function columnFor(lead: SalesLead): ColumnKey | null {
  return lead.stageKey ? COLUMN_BY_STAGE.get(lead.stageKey) ?? null : null;
}

/**
 * The automatic stage tag.
 *
 * Derived from the stage rather than stored. There is no tag column on a lead,
 * and adding one to hold a value the stage already determines would create two
 * places that can disagree about where a deal is - so moving a card changes the
 * stage, and the tag follows by definition. Nothing else can be disturbed by it
 * because nothing else is in it.
 */
export function stageTag(lead: SalesLead): string | null {
  const column = columnFor(lead);

  if (column) return `stage_${column.replace(/-/g, "_")}`;
  if (!lead.stageKey) return null;

  // Off-board stages still get a tag, so a lead opened from the table reads
  // consistently with one on the board.
  return `stage_${lead.stageKey}`;
}

export interface BoardCell {
  column: BoardColumn;
  leads: SalesLead[];
  count: number;
  value: number;
}

/**
 * The value of one opportunity.
 *
 * Re-exported from sales-view rather than defined again here, so the column
 * totals on the board and the Pipeline Value on the metric strip are the same
 * arithmetic. They were two functions once, and they disagreed.
 */
export { dealValue as opportunityValue };

/**
 * Sorts leads into columns, with totals.
 *
 * Ordered inside a column by follow-up date so the card needing attention
 * soonest sits at the top - a board sorted by creation date buries the urgent
 * one under everything filed since.
 */
export function buildBoard(leads: SalesLead[]): BoardCell[] {
  return BOARD_COLUMNS.map((column) => {
    const inColumn = leads
      .filter((lead) => columnFor(lead) === column.key)
      .sort((a, b) => {
        const at = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bt = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : Number.MAX_SAFE_INTEGER;
        return at - bt;
      });

    return {
      column,
      leads: inColumn,
      count: inColumn.length,
      value: inColumn.reduce((sum, lead) => sum + dealValue(lead), 0),
    };
  });
}

/** The stage key a drop onto this column should write. */
export function dropTargetStageKey(key: ColumnKey): string {
  const column = BOARD_COLUMNS.find((candidate) => candidate.key === key);

  if (!column) throw new Error(`No board column "${key}".`);

  return column.dropStageKey;
}

/**
 * Whether this move needs to change anything.
 *
 * A card dropped back into the column it came from is a no-op, not a stage
 * change - writing one would put a meaningless row in the history and move the
 * lead from "contacted" to "attempting contact" for no reason.
 */
export function isRealMove(lead: SalesLead, target: ColumnKey): boolean {
  return columnFor(lead) !== target;
}

/** Initials for the assignee chip, when there is no avatar. */
export function initialsOf(name: string | null): string {
  if (!name) return "??";

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
