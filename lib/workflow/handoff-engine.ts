import type { ServiceType, TeamRole } from "@prisma/client";

import { specialistsForService } from "@/lib/workflow/service-blueprints";

/**
 * Who holds the client at each point in the journey, and who gets it next.
 *
 * This is the piece the system was missing. Ownership was a single
 * `assignedUserId` for the whole relationship, so the honest answer to "who has
 * this client right now" was always the same name regardless of whether the
 * account was sitting in production with a specialist or waiting on the client
 * to return a form.
 *
 * Two ideas keep it simple:
 *
 * - The *account owner* is the standing relationship - almost always the
 *   project manager. That does not change.
 * - The *current owner* is whoever the work is sitting with today. That moves.
 *
 * Both are worth showing, and conflating them is what made the board unreadable.
 */

/** A seat, or the set of specialists this client's service actually needs. */
export type StageOwner = TeamRole | "SPECIALISTS" | "NOBODY";

/**
 * The journey, in order, with the seat that holds the client at each stage.
 *
 * Ordered rather than keyed so "who is next" is the next entry, not a second
 * map somebody has to remember to update.
 */
export const JOURNEY_OWNERSHIP: { stageKey: string; owner: StageOwner }[] = [
  { stageKey: "payment_received", owner: "PROJECT_MANAGER" },
  { stageKey: "onboarding_form_sent", owner: "PROJECT_MANAGER" },
  // The client holds this one. The project manager still chases it, which is
  // why the seat does not change - what changes is who everyone is waiting on.
  { stageKey: "waiting_for_client_information", owner: "PROJECT_MANAGER" },
  { stageKey: "access_collection", owner: "PROJECT_MANAGER" },
  { stageKey: "onboarding_complete", owner: "PROJECT_MANAGER" },
  { stageKey: "strategy_and_planning", owner: "PROJECT_MANAGER" },
  { stageKey: "in_production", owner: "SPECIALISTS" },
  { stageKey: "internal_quality_assurance", owner: "PROJECT_MANAGER" },
  { stageKey: "client_review", owner: "PROJECT_MANAGER" },
  { stageKey: "revisions_required", owner: "SPECIALISTS" },
  { stageKey: "client_approved", owner: "PROJECT_MANAGER" },
  { stageKey: "ready_for_launch", owner: "PROJECT_MANAGER" },
  { stageKey: "live_active", owner: "PROJECT_MANAGER" },
  { stageKey: "ongoing_management", owner: "PROJECT_MANAGER" },
  { stageKey: "renewal_discussion", owner: "PROJECT_MANAGER" },
  { stageKey: "offboarding", owner: "PROJECT_MANAGER" },
  { stageKey: "project_completed", owner: "PROJECT_MANAGER" },
  // An archived account is finished. Naming a holder would put it on somebody's
  // list forever.
  { stageKey: "archived", owner: "NOBODY" },
];

const ORDER = new Map(JOURNEY_OWNERSHIP.map((entry, index) => [entry.stageKey, index]));

/** Where a stage sits in the journey, or null if it is not a journey stage. */
export function journeyPosition(stageKey: string | null): number | null {
  if (!stageKey) {
    return null;
  }

  return ORDER.get(stageKey) ?? null;
}

export function stageOwner(stageKey: string | null): StageOwner | null {
  const index = journeyPosition(stageKey);

  return index === null ? null : JOURNEY_OWNERSHIP[index].owner;
}

export interface OwnershipView {
  /** Seats holding the client now. Several during production. */
  current: TeamRole[];
  /** Seats it moves to next. Empty at the end of the journey. */
  next: TeamRole[];
  /** The stage the client moves into next, if there is one. */
  nextStageKey: string | null;
}

/**
 * Resolves the seats holding the client now, and the ones receiving it next.
 *
 * "SPECIALISTS" expands to only the seats the purchased service needs, so a
 * CRM-only client in production shows the automation specialist and nobody
 * else. That expansion is the whole reason blueprints exist.
 */
export function deriveOwnership(
  stageKey: string | null,
  service: ServiceType,
): OwnershipView {
  const index = journeyPosition(stageKey);

  if (index === null) {
    // Not on the journey yet - the account is still in sales.
    return { current: ["SALES_REP"], next: ["PROJECT_MANAGER"], nextStageKey: "payment_received" };
  }

  const expand = (owner: StageOwner): TeamRole[] => {
    if (owner === "NOBODY") {
      return [];
    }

    if (owner === "SPECIALISTS") {
      const specialists = specialistsForService(service);

      // A service with no specialists still needs somebody holding it, and the
      // project manager is who actually does the work in that case.
      return specialists.length ? specialists : ["PROJECT_MANAGER"];
    }

    return [owner];
  };

  const nextEntry = JOURNEY_OWNERSHIP[index + 1] ?? null;

  return {
    current: expand(JOURNEY_OWNERSHIP[index].owner),
    next: nextEntry ? expand(nextEntry.owner) : [],
    nextStageKey: nextEntry?.stageKey ?? null,
  };
}

/**
 * The single seat to record as the client's current owner.
 *
 * The database holds one owner because "who do I chase" needs one answer. When
 * several specialists are working in parallel the project manager is that
 * answer: they are the one coordinating, and pointing at three people is the
 * same as pointing at nobody.
 */
export function primaryOwnerRole(
  stageKey: string | null,
  service: ServiceType,
): TeamRole | null {
  const { current } = deriveOwnership(stageKey, service);

  if (current.length === 0) {
    return null;
  }

  return current.length === 1 ? current[0] : "PROJECT_MANAGER";
}

/** Plain-English handoff line for the client page. */
export function describeHandoff(
  stageKey: string | null,
  service: ServiceType,
  roleLabels: Record<TeamRole, string>,
): string {
  const { current, next } = deriveOwnership(stageKey, service);

  const name = (roles: TeamRole[]) =>
    roles.length === 0 ? "nobody" : roles.map((role) => roleLabels[role]).join(" + ");

  if (next.length === 0) {
    return `${name(current)} — end of the journey`;
  }

  return `${name(current)} → ${name(next)}`;
}
