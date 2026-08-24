import { type AuthContext } from "@/lib/authz";
import { deriveHealth, summaryCards } from "@/lib/journey/journey-board";
import type { JourneyAccount, JourneyHealth, SummaryCard } from "@/lib/journey/journey-board";
import { buildJourneyAccount, journeyAccountSelect } from "@/lib/data/journey-queries";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * The six portfolio figures across the top of a client's Overview.
 *
 * These are the Journey board's cards, and they have to be *the same numbers*.
 * The board already owns those six words - Active, On Track, Waiting / Blocked,
 * At Risk, Launching Soon, Renewals Due - and it derives them operationally:
 * time in stage against the stage's target, overdue work, overdue milestones,
 * blockers. Not from the stored health assessment.
 *
 * The first version of this counted them from the Clients list's predicates
 * instead, which read the recorded assessment. Same six labels, contradictory
 * answers: the Journey board said nine accounts at risk and none on track, the
 * Overview said none at risk and five on track, on the same eleven clients at
 * the same moment. Two pages using one vocabulary for two different questions
 * is worse than either answer alone.
 *
 * So this reuses the board's own code rather than restating it: the same select,
 * the same mapper, the same summaryCards. What it skips is the work the summary
 * does not read - the requirements are never evaluated, because passing an empty
 * rules map makes buildJourneyAccount return no evaluations, and the stage list
 * is not fetched because nothing here asks what stage comes next.
 *
 * That leaves one query where the workspace runs several, and no second
 * definition of health to keep in step.
 */

async function loadAccounts(actor: AuthContext): Promise<JourneyAccount[]> {
  if (!can(actor, "clients.view.all") && !can(actor, "clients.view.assigned")) {
    return [];
  }

  const clients = await prisma.client.findMany({
    // The same scope the Journey board applies: a team member only ever sees
    // the accounts assigned to them.
    where: {
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: journeyAccountSelect,
  });

  /*
   * No requirements, no stage list.
   *
   * buildJourneyAccount returns an empty evaluation for any stage with no rules,
   * so an empty map skips the requirement engine entirely. nextStage comes from
   * the stage list and goes unread here, so that stays empty too. Every field
   * health and the six cards actually look at is on the row itself.
   */
  return clients.map((client) => buildJourneyAccount(client, new Map(), []));
}

export async function getJourneySummaryCards(
  actor: AuthContext,
  now: Date,
): Promise<SummaryCard[]> {
  return summaryCards(await loadAccounts(actor), now);
}

/**
 * Each visible account's health, keyed by client id.
 *
 * For the Dashboard's Client Snapshot, whose chip sits beside an account name
 * and so reads as a statement about the account. It used to derive its own from
 * the reader's tasks alone, which meant an account with a missed milestone and
 * no late tasks was labelled On Track while the Journey board called it At Risk,
 * and a blocked account read At Risk because that vocabulary had no Blocked.
 *
 * Same deriveHealth, same accounts, so all three pages now answer with one
 * voice. The task counts beside the chip stay personal - those genuinely are
 * about the reader's own work.
 */
export async function getJourneyHealthByClient(
  actor: AuthContext,
  now: Date,
): Promise<Map<string, JourneyHealth>> {
  const accounts = await loadAccounts(actor);

  return new Map(accounts.map((account) => [account.id, deriveHealth(account, now)]));
}
