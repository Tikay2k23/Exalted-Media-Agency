import { type AuthContext } from "@/lib/authz";
import type { AgencyMetricCounts } from "@/lib/clients/client-overview-metrics";
import { LAUNCH_HORIZON_DAYS } from "@/lib/clients/client-overview-metrics";
import { RENEWAL_HORIZON_DAYS } from "@/lib/clients/client-workspace";
import { can, canViewAllAgencyData } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * The six portfolio figures on a client's Overview, counted in the database.
 *
 * This used to load the whole visible client book - the same five-hundred-row
 * read with eight relation sub-selects the Clients list does - and then count
 * rows in TypeScript. That is a lot of traffic to produce six integers on a
 * page about one account, and it was doing it on every client page view.
 *
 * So: one round trip, six numbers. Conditional aggregates over a single scan
 * rather than six separate counts, because six counts is six round trips - and
 * against a database with a fifty-connection ceiling, the number of statements
 * matters as much as the size of the result.
 *
 * The cost of moving the predicates into SQL is that they now exist twice: once
 * here, once in client-overview-metrics as the TypeScript the Clients list
 * shares. That is a genuine drift risk and the reason for the integration test
 * beside this file, which counts the same workspace both ways and asserts the
 * two agree. If somebody renames a column or changes what "at risk" means, that
 * test fails rather than the two pages quietly disagreeing.
 */

const ZERO: AgencyMetricCounts = {
  active: 0,
  onTrack: 0,
  waiting: 0,
  atRisk: 0,
  launching: 0,
  renewals: 0,
};

/** Midnight local, the way startOfDay in client-workspace computes it. */
function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Calendar arithmetic, not milliseconds.
 *
 * Adding days as 86_400_000ms drifts an hour either side of a daylight-saving
 * change and lands the boundary off midnight, which moves accounts in and out
 * of the window twice a year.
 */
function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

interface CountRow {
  active: bigint;
  on_track: bigint;
  waiting: bigint;
  at_risk: bigint;
  launching: bigint;
  renewals: bigint;
}

export async function getAgencyMetricCounts(
  actor: AuthContext,
  now: Date,
): Promise<AgencyMetricCounts> {
  if (!can(actor, "clients.view.all") && !can(actor, "clients.view.assigned")) {
    return ZERO;
  }

  // Null means "every account". The parameter is compared with IS NULL in the
  // statement rather than branching the SQL, so there is one query to read.
  const scopeUserId = canViewAllAgencyData(actor.role) ? null : actor.id;

  const today = startOfDay(now);
  const launchUntil = addDays(today, LAUNCH_HORIZON_DAYS);

  /*
   * daysBetween compares start-of-day to start-of-day, so "within 45 days"
   * means the renewal's own midnight is at or before today + 45. Against a raw
   * timestamp that is exactly "earlier than today + 46", which needs no
   * truncation in SQL and so cannot disagree about which timezone midnight
   * falls in.
   */
  const renewalBefore = addDays(today, RENEWAL_HORIZON_DAYS + 1);

  const [row] = await prisma.$queryRaw<CountRow[]>`
    WITH base AS (
      SELECT
        c.status IN ('ACTIVE', 'AT_RISK') AS is_active,
        COALESCE(btrim(c."currentBlocker"), '') <> '' AS has_blocker,
        c."healthStatus"::text AS health,
        COALESCE(c."renewalDate", c."contractEndDate") AS renews_at,
        EXISTS (
          SELECT 1 FROM "EmployeeTask" t
          WHERE t."clientId" = c.id
            AND t."deletedAt" IS NULL
            AND t.status = 'WAITING_CLIENT'
        ) AS waiting_task,
        EXISTS (
          SELECT 1 FROM "AccessRecord" a
          WHERE a."clientId" = c.id
            AND a."isCritical"
            AND a.status NOT IN ('GRANTED', 'TESTED', 'NOT_APPLICABLE')
        ) AS missing_access,
        EXISTS (
          SELECT 1 FROM "IntakeForm" f
          WHERE f."clientId" = c.id
            AND f.status IN ('SENT', 'VIEWED', 'PARTIALLY_COMPLETED')
        ) AS intake_with_client,
        EXISTS (
          SELECT 1 FROM "Launch" l
          WHERE l."clientId" = c.id
            AND l."completedAt" IS NULL
            AND l."scheduledFor" >= ${today}
            AND l."scheduledFor" <= ${launchUntil}
        ) AS launching
      FROM "Client" c
      WHERE c."deletedAt" IS NULL
        AND (${scopeUserId}::text IS NULL OR c."assignedUserId" = ${scopeUserId})
    )
    SELECT
      COUNT(*) FILTER (WHERE is_active) AS active,
      COUNT(*) FILTER (
        WHERE is_active AND NOT has_blocker AND health = 'GREEN'
      ) AS on_track,
      COUNT(*) FILTER (
        WHERE is_active
          AND (has_blocker OR waiting_task OR missing_access OR intake_with_client)
      ) AS waiting,
      COUNT(*) FILTER (
        WHERE is_active AND NOT has_blocker AND health = 'RED'
      ) AS at_risk,
      COUNT(*) FILTER (WHERE launching) AS launching,
      COUNT(*) FILTER (
        WHERE is_active AND renews_at IS NOT NULL AND renews_at < ${renewalBefore}
      ) AS renewals
    FROM base
  `;

  if (!row) return ZERO;

  // Postgres counts come back as bigint, which does not survive serialisation
  // into a client component.
  return {
    active: Number(row.active),
    onTrack: Number(row.on_track),
    waiting: Number(row.waiting),
    atRisk: Number(row.at_risk),
    launching: Number(row.launching),
    renewals: Number(row.renewals),
  };
}
