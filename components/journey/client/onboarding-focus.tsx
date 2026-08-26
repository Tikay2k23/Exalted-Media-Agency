"use client";

/**
 * The focus card, and the three drawers its buttons open.
 *
 * Every heading, number and button on this card is computed on the server from
 * records that already exist - the intake form, the stage gate, the raised
 * conditions, the access and asset registers, the review cycles and the A2P
 * profile. Nothing here decides what the state is; it decides what that state
 * looks like. That split is why the card cannot go back to telling somebody to
 * chase a form that has already been read.
 *
 * The drawers deliberately do not hold copies of anything. Contacts to Chase
 * is grouped from the same outstanding list the card counted, Missing
 * Information is the same intake gaps the percentage was derived from, and
 * View Requirements is the same stage-gate evaluation the move button obeys.
 * One calculation, four views.
 */

import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardList,
  Compass,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  UserRound,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Card } from "@/components/journey/client/journey-cards";
import { Modal } from "@/components/journey/client/journey-dialogs";
import { Button } from "@/components/ui/button";
import type { JourneyClientDetail } from "@/lib/journey/client-detail";
import type { ChaseGroup } from "@/lib/journey/contacts-to-chase";
import {
  CATEGORY_LABELS,
  type FactTone,
  type FocusActionKey,
  type OutstandingItem,
} from "@/lib/journey/onboarding-focus";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* The card                                                                   */
/* -------------------------------------------------------------------------- */

const TONE_BORDER: Record<FactTone, string> = {
  good: "border-emerald-100 bg-emerald-50/60",
  warn: "border-amber-100 bg-amber-50/60",
  bad: "border-rose-100 bg-rose-50/60",
  neutral: "border-slate-100 bg-slate-50",
};

const TONE_TEXT: Record<FactTone, string> = {
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-rose-700",
  neutral: "text-slate-700",
};

const TONE_BADGE: Record<FactTone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  bad: "border-rose-200 bg-rose-50 text-rose-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
};

export function OnboardingFocusCard({
  detail,
  onAct,
}: {
  detail: JourneyClientDetail;
  onAct: (action: FocusActionKey) => void;
}) {
  const { focus } = detail.onboarding;

  return (
    <Card
      icon={Compass}
      title={focus.title}
      action={
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            TONE_BADGE[focus.statusTone],
          )}
        >
          {focus.statusLabel}
        </span>
      }
    >
      <p className="text-xs leading-5 text-slate-600">{focus.description}</p>

      {focus.facts.length > 0 ? (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
          {focus.facts.map((fact) => (
            <div
              key={fact.label}
              className={cn("rounded-xl border px-3 py-2", TONE_BORDER[fact.tone])}
            >
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                {fact.label}
              </p>
              <p className={cn("mt-0.5 truncate text-xs font-semibold", TONE_TEXT[fact.tone])}>
                {fact.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {focus.actions.map((action) => (
          <Button
            key={action.key}
            type="button"
            size="sm"
            variant={action.primary ? "primary" : "secondary"}
            className="gap-1.5"
            onClick={() => onAct(action.key)}
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        ))}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

function Pill({ item }: { item: OutstandingItem }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        item.overdue
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : item.blocking
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-slate-50 text-slate-500",
      )}
    >
      {item.overdue ? "Overdue" : item.blocking ? "Blocking" : CATEGORY_LABELS[item.category]}
    </span>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
      {children}
    </p>
  );
}

function shortDay(iso: string | null) {
  if (!iso) return null;

  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* -------------------------------------------------------------------------- */
/* Contacts to chase                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Who owes what, grouped by person.
 *
 * The list is derived, so a contact leaves it by the client answering rather
 * than by anybody ticking them off it. Nothing here is editable: the buttons
 * either record a real event or open the record where the work is done.
 */
export function ContactsToChaseDrawer({
  detail,
  onClose,
  onChanged,
}: {
  detail: JourneyClientDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { chase } = detail.onboarding;

  return (
    <Modal
      eyebrow={detail.account.companyName}
      title="Contacts to Chase"
      onClose={onClose}
      footer={
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {chase.length === 0 ? (
        <Empty>No client follow-ups are currently needed.</Empty>
      ) : (
        <div className="space-y-3">
          {chase.map((group) => (
            <ChaseCard
              key={group.contact?.id ?? "unassigned"}
              group={group}
              clientId={detail.account.id}
              companyName={detail.account.companyName}
              canManage={detail.onboarding.canReviewIntake}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

function ChaseCard({
  group,
  clientId,
  companyName,
  canManage,
  onChanged,
}: {
  group: ChaseGroup;
  clientId: string;
  companyName: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const contact = group.contact;

  /*
   * The message the agency would send anyway, assembled from the same items.
   *
   * There is no mail server in this application, so this opens whatever the
   * person already uses. What gets recorded is that a chase happened, which is
   * the part the account needs to remember.
   */
  // The whole name, not a first-name split: "Dr. Omar Haddad" split on the
  // first space greets somebody as "Dr.".
  const body = useMemo(() => {
    const lines = group.items.map((item) => `- ${item.label}`).join("\n");

    return `Hi ${contact?.name ?? "there"},\n\nWe are still waiting on a few things to move ${companyName} forward:\n\n${lines}\n\nCould you let us know where these stand?\n\nThanks`;
  }, [group.items, contact?.name, companyName]);

  const subject = `${companyName}: outstanding information`;

  async function post(action: string, flagId: string, key: string) {
    setBusyKey(key);
    setError(null);

    try {
      const response = await fetch(`/api/clients/${clientId}/journey-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, flagId }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "That did not work. Try again.");
        return;
      }

      setDone(key);
      startTransition(onChanged);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyKey(null);
    }
  }

  /*
   * Only raised conditions carry chasing history, so only they can record a
   * follow-up. An access record or an unanswered intake question has nowhere
   * to write "asked again on Tuesday" - claiming otherwise would be inventing
   * a status the backend does not keep.
   */
  const recordable = group.items.filter(
    (item) => item.category === "dependency" && item.recordId !== null,
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <UserRound className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            {contact?.name ?? "No contact on file"}
          </p>
          <p className="text-[11px] text-slate-500">
            {contact?.role ?? "Role not recorded"}
            {contact?.isPrimary ? " - Primary contact" : ""}
            {contact?.isApprover ? " - Authorised approver" : ""}
          </p>
        </div>
        {group.hasOverdue ? (
          <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
            Overdue
          </span>
        ) : null}
      </header>

      <ul className="mt-2.5 space-y-1.5">
        {group.items.map((item) => (
          <li key={item.key} className="flex items-start justify-between gap-2">
            <span className="min-w-0 text-xs leading-5 text-slate-700">
              {item.label}
              {item.received ? (
                <span className="ml-1.5 text-[10px] font-semibold uppercase text-emerald-600">
                  Received
                </span>
              ) : null}
            </span>
            <Pill item={item} />
          </li>
        ))}
      </ul>

      <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5">
        <Ageing label="First asked" value={shortDay(group.firstRequestedAt) ?? "Not recorded"} />
        <Ageing label="Last chased" value={shortDay(group.lastFollowUpAt) ?? "Never"} />
        <Ageing
          label="Chases"
          value={group.followUpCount === 0 ? "None" : String(group.followUpCount)}
        />
      </dl>

      {group.byDefault ? (
        <p className="mt-2 text-[10px] leading-4 text-slate-400">
          Some of these were raised against the account rather than a named person.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {/*
          * Email and SMS hand off to whatever the person already uses. The
          * application has no mailer and no SMS provider, so a button that
          * claimed to send would be claiming something untrue.
          */}
        {contact?.email ? (
          <a
            href={`mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Mail className="h-3 w-3" aria-hidden />
            Email
          </a>
        ) : (
          <span
            title="No email address recorded for this contact."
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-400"
          >
            <Mail className="h-3 w-3" aria-hidden />
            No email on file
          </span>
        )}

        {contact?.phone ? (
          <a
            href={`sms:${contact.phone.replace(/[^+\d]/g, "")}?body=${encodeURIComponent(body)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <MessageSquare className="h-3 w-3" aria-hidden />
            SMS
          </a>
        ) : (
          <span
            title="No mobile number available."
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-400"
          >
            <Phone className="h-3 w-3" aria-hidden />
            No mobile number available
          </span>
        )}
      </div>

      {canManage && recordable.length > 0 ? (
        <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">
            Record against the request
          </p>
          {recordable.map((item) => (
            <div
              key={item.key}
              className="flex flex-wrap items-center justify-between gap-1.5"
            >
              <span className="min-w-0 truncate text-[11px] text-slate-600">{item.label}</span>
              <span className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  disabled={pending || busyKey !== null}
                  onClick={() => post("follow-up", item.recordId as string, `f-${item.key}`)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {busyKey === `f-${item.key}` ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                  ) : done === `f-${item.key}` ? (
                    <Check className="h-2.5 w-2.5 text-emerald-600" aria-hidden />
                  ) : null}
                  Log follow-up
                </button>
                {item.received ? null : (
                  <button
                    type="button"
                    disabled={pending || busyKey !== null}
                    onClick={() => post("received", item.recordId as string, `r-${item.key}`)}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {busyKey === `r-${item.key}` ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                    ) : null}
                    Mark received
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Ageing({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-[11px] font-medium text-slate-700">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Missing information                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The required intake questions with nothing in them, by section.
 *
 * Grouped so somebody can tell a client "the whole business section is blank"
 * rather than reading them nine unrelated field names down the phone.
 */
export function MissingInformationDrawer({
  detail,
  onClose,
  onOpenForm,
}: {
  detail: JourneyClientDetail;
  onClose: () => void;
  onOpenForm: () => void;
}) {
  const { intake } = detail.onboarding;

  const sections = useMemo(() => {
    const grouped = new Map<string, { title: string; labels: string[] }>();

    for (const answer of intake.missingRequired) {
      const existing = grouped.get(answer.sectionId);

      if (existing) existing.labels.push(answer.label);
      else grouped.set(answer.sectionId, { title: answer.sectionTitle, labels: [answer.label] });
    }

    return [...grouped.values()];
  }, [intake.missingRequired]);

  return (
    <Modal
      eyebrow={detail.account.companyName}
      title="Missing Information"
      onClose={onClose}
      footer={
        <>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="button" size="sm" onClick={onOpenForm}>
            Open Onboarding Form
          </Button>
        </>
      }
    >
      {sections.length === 0 ? (
        <Empty>No required information is missing.</Empty>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-5 text-slate-600">
            {intake.missingRequired.length} required answer
            {intake.missingRequired.length === 1 ? "" : "s"} still to come from the client.
            Everything here is theirs to provide.
          </p>

          {sections.map((section) => (
            <section key={section.title} className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-900">{section.title}</p>
              <ul className="mt-1.5 space-y-1">
                {section.labels.map((label) => (
                  <li key={label} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400"
                    />
                    <span className="text-xs leading-5 text-slate-600">{label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Requirements                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Everything still outstanding, in chase order.
 *
 * The same list the focus card counted, shown in full. Read-only on purpose:
 * each of these already has a screen that owns it, and a second place to edit
 * an access record is a second place for it to be edited wrongly.
 */
export function RequirementsDrawer({
  detail,
  onClose,
  onChase,
}: {
  detail: JourneyClientDetail;
  onClose: () => void;
  onChase: () => void;
}) {
  const { outstanding } = detail.onboarding;

  return (
    <Modal
      eyebrow={detail.account.companyName}
      title="Outstanding Requirements"
      onClose={onClose}
      footer={
        <>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
          {detail.onboarding.chase.length > 0 ? (
            <Button type="button" size="sm" onClick={onChase}>
              Contacts to Chase
            </Button>
          ) : null}
        </>
      }
    >
      {outstanding.length === 0 ? (
        <Empty>Nothing is outstanding on this account.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {outstanding.map((item) => (
            <li
              key={item.key}
              className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800">{item.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {CATEGORY_LABELS[item.category]}
                  {item.clientOwned ? " - client" : " - agency"}
                  {item.dueAt ? ` - due ${shortDay(item.dueAt)}` : ""}
                </p>
              </div>
              <Pill item={item} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

export { ClipboardList as OnboardingIcon };
