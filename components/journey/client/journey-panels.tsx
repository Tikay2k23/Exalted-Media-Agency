"use client";

import {
  ArrowRight,
  Building2,
  CircleAlert,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { Card, Quiet } from "@/components/journey/client/journey-cards";
import { Button } from "@/components/ui/button";
import {
  type AttentionCard,
  type JourneyClientDetail,
  activityStamp,
  formatDay,
} from "@/lib/journey/client-detail";
import { type JourneyActivityEntry } from "@/lib/journey/journey-board";
import { cn, formatEnumLabel } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Needs attention                                                            */
/* -------------------------------------------------------------------------- */

const TONE_TEXT = {
  amber: "text-amber-800",
  rose: "text-rose-800",
  violet: "text-violet-800",
  slate: "text-slate-800",
} as const;

const TONE_HEAD = {
  amber: "text-amber-700",
  rose: "text-rose-700",
  violet: "text-violet-700",
  slate: "text-slate-700",
} as const;

/**
 * Only ever shown when something is genuinely wrong.
 *
 * An empty panel taking a third of the sidebar teaches people to stop looking
 * at it, so a clean account gets one quiet line instead.
 */
export function NeedsAttentionPanel({
  cards,
  busy,
  onAct,
}: {
  cards: AttentionCard[];
  busy: string | null;
  onAct: (card: AttentionCard) => void;
}) {
  if (cards.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white" aria-hidden>
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 fill-none stroke-current stroke-[2]">
            <path d="M1.5 5.2 4 7.5 8.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="text-xs font-medium text-emerald-800">Everything is on track.</p>
      </div>
    );
  }

  return (
    <Card icon={TriangleAlert} title="Needs Attention" bodyClassName="space-y-3 p-4">
      {cards.map((card) => (
        <div key={card.key} className={cn(card.key !== cards[0].key && "border-t border-slate-100 pt-3")}>
          <p className={cn("text-sm font-semibold leading-snug", TONE_HEAD[card.tone])}>
            {card.title}
          </p>
          <div className={cn("mt-1 space-y-0.5", TONE_TEXT[card.tone])}>
            {card.lines.map((line) => (
              <p key={line} className="text-[11px] leading-4 opacity-90">
                {line}
              </p>
            ))}
          </div>

          {card.action ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy === card.key}
              onClick={() => onAct(card)}
              className="mt-2.5 h-8 w-full gap-1.5 text-[11px]"
            >
              {busy === card.key ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : card.action === "Send Follow-Up" ? (
                <Mail className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <CircleAlert className="h-3.5 w-3.5" aria-hidden />
              )}
              {card.action}
            </Button>
          ) : null}
        </div>
      ))}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Client information                                                         */
/* -------------------------------------------------------------------------- */

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-[5px]">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 break-words text-xs font-medium text-slate-800">{value}</div>
    </div>
  );
}

/**
 * Only what delivery needs to reach the client and know the dates.
 *
 * Deliberately not the account record: the full profile is one click away, and
 * duplicating it here would make two places to read and eventually two places
 * that disagree.
 */
export function ClientInformationPanel({
  detail,
  onOpenJourney,
  onOpenTab,
}: {
  detail: JourneyClientDetail;
  /** Jump to the journey itself, which the stage row offers. */
  onOpenJourney?: () => void;
  /** Move to another tab of the client record without a full navigation. */
  onOpenTab?: (tab: "contacts" | "services") => void;
}) {
  const { account } = detail;
  const primary = detail.contacts.find((contact) => contact.isPrimary) ?? detail.contacts[0];
  /*
   * The approver comes from the existing contact role rather than a second
   * field. Somebody marked as the approver is who signs off; there is no
   * separate authorised-approver record to keep in step with this one.
   */
  const approver = detail.contacts.find((contact) => contact.isApprover) ?? null;
  const services = account.services.map((service) => formatEnumLabel(service));

  return (
    <Card icon={Building2} title="Essential Client Info">
      <div className="divide-y divide-slate-100">
        <InfoRow label="Primary Contact" value={primary?.name ?? account.clientName} />
        <InfoRow
          label="Email"
          value={
            primary?.email ? (
              <a href={`mailto:${primary.email}`} className="text-sky-700 hover:underline">
                {primary.email}
              </a>
            ) : (
              <span className="text-slate-400">Not recorded</span>
            )
          }
        />
        <InfoRow
          label="Phone"
          value={
            primary?.phone ? (
              // tel: reaches whatever the machine already uses to dial.
              <a href={`tel:${primary.phone.replace(/[^+\d]/g, "")}`} className="text-sky-700 hover:underline">
                {primary.phone}
              </a>
            ) : (
              <span className="text-slate-400">Not recorded</span>
            )
          }
        />
        <InfoRow
          label="Authorised Approver"
          value={
            approver ? (
              <span className="flex flex-wrap items-baseline gap-1.5">
                {approver.name}
                <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                  Confirmed
                </span>
              </span>
            ) : (
              <span className="text-slate-400">Not assigned</span>
            )
          }
        />
        {/*
          * The account's manager, not whoever sits in a project's manager
          * column. That column will accept anybody, and on at least one live
          * account it holds a creative specialist - naming them the project
          * manager here would be exactly the wrong answer to "who owns this".
          */}
        <InfoRow
          label="Project Manager"
          value={
            detail.onboarding.projectManager?.name ?? (
              <span className="text-amber-700">Not assigned</span>
            )
          }
        />
        <InfoRow
          label="Current Journey Stage"
          value={
            onOpenJourney ? (
              <button
                type="button"
                onClick={onOpenJourney}
                className="text-left text-sky-700 hover:underline"
              >
                {account.stageName}
              </button>
            ) : (
              account.stageName
            )
          }
        />
        <InfoRow
          label="Services"
          value={
            services.length === 0 ? (
              <span className="text-slate-400">None recorded</span>
            ) : (
              /*
               * The primary plus a count, rather than a list that wraps to
               * four lines on an account that bought everything.
               */
              <span className="flex flex-wrap items-baseline gap-1.5">
                {onOpenTab ? (
                  <button
                    type="button"
                    onClick={() => onOpenTab("services")}
                    className="text-left text-sky-700 hover:underline"
                  >
                    {services[0]}
                  </button>
                ) : (
                  services[0]
                )}
                {services.length > 1 ? (
                  <span className="text-[11px] text-slate-500">
                    +{services.length - 1} more
                  </span>
                ) : null}
              </span>
            )
          }
        />
        <InfoRow
          label="Project Start Date"
          value={
            detail.projectStartDate ? (
              formatDay(detail.projectStartDate)
            ) : (
              <span className="text-slate-400">Not set</span>
            )
          }
        />
        <InfoRow
          label="Target Launch Date"
          value={
            detail.targetLaunchDate ? (
              formatDay(detail.targetLaunchDate)
            ) : (
              <span className="text-slate-400">Not set</span>
            )
          }
        />
        <InfoRow
          label="Renewal Date"
          value={
            detail.renewalDate ? (
              formatDay(detail.renewalDate)
            ) : (
              <span className="text-slate-400">Not set</span>
            )
          }
        />
      </div>

      {/*
        * Account, not the client root.
        *
        * Everything above this button is contact and ownership information,
        * and Account is where that is edited. Landing somebody on Overview and
        * letting them find it themselves is a click this card can spend.
        */}
      {onOpenTab ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3 h-8 w-full gap-1.5 text-[11px]"
          onClick={() => onOpenTab("contacts")}
        >
          Open Full Client Profile
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Button>
      ) : (
        <Link href={`/clients/${account.id}?tab=contacts`} className="mt-3 block">
          <Button size="sm" variant="secondary" className="h-8 w-full gap-1.5 text-[11px]">
            Open Full Client Profile
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Button>
        </Link>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Recent activity                                                            */
/* -------------------------------------------------------------------------- */

const DOT_TONE: Record<JourneyActivityEntry["kind"], string> = {
  stage: "bg-sky-500",
  override: "bg-rose-500",
  blocker: "bg-amber-500",
  approval: "bg-emerald-500",
  asset: "bg-violet-500",
  milestone: "bg-slate-400",
  other: "bg-slate-300",
};

export function RecentActivityPanel({
  entries,
  now,
  clientId,
}: {
  entries: JourneyActivityEntry[];
  now: Date;
  clientId: string;
}) {
  const shown = entries.slice(0, 5);

  return (
    <Card
      icon={Clock}
      title="Recent Stage Activity"
      action={
        <Link
          href={`/journey/${clientId}/history`}
          className="text-[11px] font-semibold text-sky-700 hover:text-sky-800"
        >
          View Full History
        </Link>
      }
    >
      {shown.length === 0 ? (
        <Quiet>No Journey activity yet.</Quiet>
      ) : (
        <ol className="space-y-3">
          {shown.map((entry) => (
            <li key={entry.id} className="flex gap-2.5">
              <span
                className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", DOT_TONE[entry.kind])}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-slate-400">
                  {activityStamp(entry.createdAt, now)}
                </p>
                <p className="mt-0.5 text-xs leading-4 text-slate-700">{entry.action}</p>
                {entry.actorName ? (
                  <p className="mt-0.5 text-[10px] text-slate-400">by {entry.actorName}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export { ArrowRight };
