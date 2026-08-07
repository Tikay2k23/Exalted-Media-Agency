import type { DefectSeverity, DefectStatus } from "@prisma/client";

import { type AuthorizableUser, can } from "@/lib/permissions";

/**
 * Independent verification of defect fixes.
 *
 * SOP section 16: the person who did the work cannot sign off their own fix
 * without QA verification, unless someone with QA approval authority
 * explicitly authorizes it and records why.
 *
 * This is a pure decision function so the rule can be tested exhaustively and
 * reused by any caller that closes a defect.
 */

export interface ClosableDefect {
  reference: string;
  status: DefectStatus;
  severity: DefectSeverity;
  assignedToId: string | null;
  raisedById: string | null;
}

export type DefectClosureDenialCode =
  | "NO_PERMISSION"
  | "SELF_VERIFICATION"
  | "ALREADY_CLOSED"
  | "OVERRIDE_REASON_REQUIRED";

export type DefectClosureDecision =
  | { allowed: true; requiresOverrideRecord: boolean }
  | { allowed: false; code: DefectClosureDenialCode; message: string };

export interface DefectClosureRequest {
  actor: AuthorizableUser & { id: string };
  defect: ClosableDefect;
  /** Supplied when the actor is knowingly closing a defect they worked on. */
  overrideReason?: string | null;
}

const MIN_OVERRIDE_REASON_LENGTH = 10;

const CLOSED_STATUSES: ReadonlySet<DefectStatus> = new Set(["CLOSED", "PASSED", "WONT_FIX"]);

export function evaluateDefectClosure(
  request: DefectClosureRequest,
): DefectClosureDecision {
  const { actor, defect } = request;

  if (CLOSED_STATUSES.has(defect.status)) {
    return {
      allowed: false,
      code: "ALREADY_CLOSED",
      message: `${defect.reference} is already ${defect.status.toLowerCase().replaceAll("_", " ")}.`,
    };
  }

  if (!can(actor, "qa.closeDefect")) {
    return {
      allowed: false,
      code: "NO_PERMISSION",
      message: "You do not have permission to close defects.",
    };
  }

  const isOwnWork = defect.assignedToId !== null && defect.assignedToId === actor.id;

  if (!isOwnWork) {
    return { allowed: true, requiresOverrideRecord: false };
  }

  // From here down, the actor is closing a defect assigned to themselves.
  if (!can(actor, "qa.approve")) {
    return {
      allowed: false,
      code: "SELF_VERIFICATION",
      message:
        `${defect.reference} is assigned to you. Another reviewer must verify the fix `
        + "before it can be closed.",
    };
  }

  const reason = request.overrideReason?.trim() ?? "";

  if (reason.length < MIN_OVERRIDE_REASON_LENGTH) {
    return {
      allowed: false,
      code: "OVERRIDE_REASON_REQUIRED",
      message:
        `${defect.reference} is assigned to you. Closing your own fix requires a written `
        + `reason of at least ${MIN_OVERRIDE_REASON_LENGTH} characters, which is recorded `
        + "against the defect.",
    };
  }

  return { allowed: true, requiresOverrideRecord: true };
}
