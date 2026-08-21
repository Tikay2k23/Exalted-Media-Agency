import { Link2 } from "lucide-react";

/**
 * Integrations.
 *
 * Nothing is connected yet, and this says so rather than showing a Sync Now
 * button that would do nothing. What it does record is the shape a GoHighLevel
 * private-integration sync will need, so the decision that matters - which
 * identifier is authoritative - is settled before any of it is built.
 *
 * The client id is the internal identifier and stays that way. Keying on email
 * would mean an account changing hands, or a contact correcting a typo, quietly
 * becoming a different record on the next sync.
 */
export function ClientIntegrations({
  clientId,
  companyName,
}: {
  clientId: string;
  companyName: string;
}) {
  const fields = [
    ["GHL Location ID", "Which sub-account this client is in GoHighLevel."],
    ["GHL Contact ID", "The primary contact, once mapped."],
    ["GHL Opportunity ID", "The won opportunity this account came from."],
    ["GHL Pipeline ID", "Which pipeline the opportunity sits on."],
    ["GHL Stage ID", "Its stage there, for the two-way stage sync."],
    ["Last Sync", "When the last successful sync finished."],
    ["Sync Status", "Idle, running, or failed."],
    ["Sync Error", "What went wrong, kept until the next success."],
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="border-b border-slate-100 p-4">
        <h2 className="text-sm font-semibold text-slate-950">Integrations</h2>
        <p className="text-xs text-slate-500">
          Nothing is connected to {companyName} yet.
        </p>
      </header>

      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-slate-200 p-4">
          <span className="shrink-0 rounded-lg bg-slate-100 p-2 text-slate-500">
            <Link2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">GoHighLevel</p>
            <p className="mt-0.5 text-xs text-slate-600">
              A private-integration sync is planned. Until it exists there is nothing to sync
              and no button here that pretends otherwise.
            </p>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            What the sync will store
          </p>
          <dl className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
            {fields.map(([label, description]) => (
              <div key={label} className="rounded-xl border border-slate-200 p-3">
                <dt className="text-xs font-medium text-slate-800">{label}</dt>
                <dd className="mt-0.5 text-[11px] text-slate-500">{description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          This account&rsquo;s internal identifier is{" "}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px] text-slate-700">
            {clientId}
          </code>
          . Any integration keys off that, never off an email address - an address can change
          hands, and a sync that keyed on one would silently write to the wrong account.
        </p>
      </div>
    </section>
  );
}
